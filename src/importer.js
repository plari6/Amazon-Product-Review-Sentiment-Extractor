// Import reviews from CSV / JSON / JSONL exports (Helium 10, Apify, Jungle Scout, Keepa, Excel sheets saved as CSV,
// your own Seller Central exports) or from Amazon review pages saved from the browser (.html).
import fs from 'node:fs';
import path from 'node:path';
import { ASIN_RE, productKey } from './amazon/marketplaces.js';
import { parseProductPage, parseReviewsPage } from './amazon/parse.js';
import { makeReview } from './normalize.js';
import { parseCount, parseCsv, parseReviewCountry, parseReviewDate, parseStars, slug } from './util.js';

const ALIASES = {
  rating: ['rating', 'stars', 'star', 'star_rating', 'score', 'review_rating', 'reviewrating', 'ratingscore', 'review_stars', 'overall'],
  title: ['title', 'review_title', 'reviewtitle', 'headline', 'review_headline', 'summary', 'subject'],
  body: ['body', 'text', 'content', 'review', 'review_text', 'reviewtext', 'comment', 'review_body', 'reviewbody', 'reviewdescription', 'description', 'review_content', 'reviewtext'],
  date: ['date', 'review_date', 'reviewdate', 'created_at', 'createdat', 'submission_time', 'submitted', 'time', 'reviewed_at', 'datetime'],
  author: ['author', 'reviewer', 'name', 'user', 'username', 'profilename', 'reviewer_name', 'reviewername', 'customer'],
  verified: ['verified', 'verified_purchase', 'isverified', 'verifiedpurchase', 'is_verified', 'avp'],
  helpful: ['helpful', 'helpful_votes', 'helpfulvotes', 'helpful_count', 'helpfulcount', 'votes', 'likes', 'reviewreaction', 'found_helpful'],
  variant: ['variant', 'variation', 'format', 'style', 'product_attributes', 'variantattributes', 'size', 'color'],
  reviewId: ['review_id', 'reviewid', 'id'],
  asin: ['asin', 'product_asin', 'productasin', 'parent_asin', 'parentasin', 'originalasin'],
  product: ['product', 'product_name', 'productname', 'product_title', 'producttitle', 'item', 'item_name'],
  country: ['country', 'marketplace', 'reviewed_in', 'location'],
  url: ['url', 'link', 'review_url', 'reviewurl', 'review_link'],
  images: ['images', 'image_count', 'imagecount', 'reviewimages'],
};

const norm = (k) => String(k).toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

export function mapRow(row) {
  const lower = {};
  for (const [k, v] of Object.entries(row)) lower[norm(k)] = v;
  const pick = (field) => {
    for (const a of ALIASES[field]) {
      const v = lower[a] ?? lower[a.replace(/_/g, '')];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };
  const rawRating = pick('rating');
  const rawDate = pick('date');
  const v = pick('verified');
  const images = pick('images');
  return {
    reviewId: pick('reviewId') ? String(pick('reviewId')) : undefined,
    rating: typeof rawRating === 'number' ? rawRating : parseStars(rawRating),
    title: pick('title') ?? '',
    body: pick('body') ?? '',
    date: rawDate ? (typeof rawDate === 'number' ? new Date(rawDate > 1e12 ? rawDate : rawDate * 1000).toISOString().slice(0, 10) : parseReviewDate(rawDate)) : null,
    country: pick('country') || (rawDate ? parseReviewCountry(rawDate) : null),
    author: pick('author') ?? null,
    verified: v === undefined ? undefined : typeof v === 'boolean' ? v : /^(1|true|yes|y|verified|verified purchase|x)$/i.test(String(v).trim()),
    helpful: typeof pick('helpful') === 'number' ? pick('helpful') : parseCount(pick('helpful')) || (/^one\b/i.test(String(pick('helpful') || '')) ? 1 : 0),
    variant: typeof pick('variant') === 'object' ? JSON.stringify(pick('variant')) : pick('variant') ?? null,
    url: pick('url') ?? null,
    images: Array.isArray(images) ? images.length : Number(images) || 0,
    asin: pick('asin') ? String(pick('asin')).toUpperCase() : undefined,
    product: pick('product') ?? undefined,
  };
}

function readRows(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : j.reviews || j.items || j.data || j.results || [];
  }
  if (ext === '.jsonl' || ext === '.ndjson') return raw.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') return parseCsv(raw);
  throw new Error(`Unsupported file type ${ext} (use .csv, .json, .jsonl or a saved .html review page)`);
}

/**
 * @returns {{ products: {key,label,added,total}[], skipped: number }}
 */
export function importFile(file, store, { asin, product, domain = 'amazon.com', own, label } = {}) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html' || ext === '.htm') return importHtml(file, store, { asin, product, domain, own, label });

  const rows = readRows(file).map(mapRow);
  const groups = new Map();
  let skipped = 0;
  const fallbackName = product || label || path.basename(file, ext);
  for (const r of rows) {
    if (!r.body && !r.title) { skipped++; continue; }
    const a = (asin || r.asin || '').toUpperCase();
    const key = ASIN_RE.test(a) ? productKey({ asin: a, domain }) : `import:${slug(r.product || fallbackName) || 'reviews'}`;
    if (!groups.has(key)) groups.set(key, { asin: ASIN_RE.test(a) ? a : null, name: r.product || fallbackName, rows: [] });
    groups.get(key).rows.push(r);
  }

  const out = [];
  for (const [key, g] of groups) {
    const p = store.upsertProduct({
      key, asin: g.asin, domain: g.asin ? domain : null, source: 'import',
      url: g.asin ? `https://www.${domain}/dp/${g.asin}` : null,
      title: store.product(key)?.title || g.name,
      label: label && groups.size === 1 ? label : undefined, own: own || undefined,
    });
    const reviews = g.rows.map((r) => makeReview({
      ...r,
      url: r.url || (r.reviewId && g.asin && /^R[A-Z0-9]+$/.test(r.reviewId) ? `https://www.${domain}/gp/customer-reviews/${r.reviewId}` : null),
    }, { productKey: key, source: 'import' }));
    const added = store.addReviews(reviews);
    out.push({ key, label: p.label, added, total: reviews.length });
  }
  return { products: out, skipped };
}

function importHtml(file, store, { asin, product, domain, own, label }) {
  const html = fs.readFileSync(file, 'utf8');
  const canon = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] || '';
  const guessAsin = (asin || canon.match(/\/(?:dp|product-reviews)\/([A-Z0-9]{10})/)?.[1] || html.match(/data-asin="([A-Z0-9]{10})"/)?.[1] || '').toUpperCase();
  const dom = canon.match(/amazon\.[a-z.]+/)?.[0] || domain;
  const key = ASIN_RE.test(guessAsin) ? productKey({ asin: guessAsin, domain: dom }) : `import:${slug(product || path.basename(file, path.extname(file)))}`;
  const info = parseProductPage(html, { domain: dom });
  const page = parseReviewsPage(html, { domain: dom });
  const p = store.upsertProduct({
    key, asin: ASIN_RE.test(guessAsin) ? guessAsin : null, domain: dom, source: 'html',
    url: ASIN_RE.test(guessAsin) ? `https://www.${dom}/dp/${guessAsin}` : null,
    title: info.title || page.productTitle || product || null, brand: info.brand, rating: info.rating,
    ratingsCount: info.ratingsCount, histogram: info.histogram, summary: info.summary,
    insights: info.insights?.length ? info.insights : undefined, label, own: own || undefined,
  });
  const reviews = page.reviews.map((r) => makeReview(r, { productKey: key, source: 'html' }));
  return { products: [{ key, label: p.label, added: store.addReviews(reviews), total: reviews.length }], skipped: 0 };
}
