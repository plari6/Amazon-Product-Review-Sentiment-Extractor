// Cheerio parsers for Amazon product pages and review lists.
// Selectors rely on Amazon's stable `data-hook` attributes; every field has a fallback.
import * as cheerio from 'cheerio';
import { cleanText, parseCount, parseReviewCountry, parseReviewDate, parseStars } from '../util.js';
import { reviewLink } from './marketplaces.js';

const text = ($el) => cleanText($el.first().text());

/** Returns 'signin' | 'captcha' | 'blocked' | 'not_found' | null */
export function detectBlock({ status = 200, url = '', html = '' } = {}) {
  if (/\/ap\/signin|\/ax\/claim|\/ap\/cvf/i.test(url)) return 'signin';
  const head = html.slice(0, 60000);
  if (/validateCaptcha|Type the characters you see in this image|Enter the characters you see below|opfcaptcha/i.test(head)) return 'captcha';
  if (status === 404 || /<title>\s*(Page Not Found|Seite wurde nicht gefunden|Document Not Found)/i.test(head)) return 'not_found';
  if (status === 503 || status === 429 || /api-services-support@amazon\.com|Sorry! Something went wrong/i.test(head)) return 'blocked';
  if (status === 401 || status === 403) return 'blocked';
  if (/<form[^>]+name="signIn"/i.test(head) && !/data-hook="review"/.test(html)) return 'signin';
  return null;
}

export function parseProductPage(html, { domain = 'amazon.com', baseUrlOverride } = {}) {
  const $ = cheerio.load(html);
  const title = text($('#productTitle')) || text($('#title')) || cleanText($('meta[name="title"]').attr('content')) || null;
  let brand = text($('#bylineInfo')) || null;
  if (brand) brand = brand.replace(/^(Visit the|Brand:|Marke:|Marque\s*:|Marca:|Besuche den)\s*/i, '').replace(/\s*(Store|Shop)$/i, '').trim() || null;
  const price = text($('#corePrice_feature_div .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #apex_desktop .a-price .a-offscreen')) || text($('.a-price .a-offscreen')) || null;
  const rating = parseStars(text($('[data-hook="rating-out-of-text"]'))) ?? parseStars($('#acrPopover').attr('title')) ?? parseStars(text($('#acrPopover .a-icon-alt')));
  const ratingsCount = parseCount(text($('[data-hook="total-review-count"]'))) ?? parseCount(text($('#acrCustomerReviewText')));

  return {
    title,
    brand,
    price,
    rating,
    ratingsCount,
    histogram: parseHistogram($),
    summary: text($('[data-testid="overall-summary"]')) || text($('#product-summary p').first()) || null,
    insights: parseInsights($),
    reviews: parseReviewNodes($, { domain, baseUrlOverride }),
  };
}

/** Star histogram as { 1: pct, ..., 5: pct } (percent of all ratings). */
export function parseHistogram($) {
  const hist = {};
  $('[aria-label]').each((_, el) => {
    const label = $(el).attr('aria-label') || '';
    let m = label.match(/(\d{1,3})\s*(?:percent|%|Prozent|pour cent|por ciento|per cento|procent)[^\d]{0,40}?(\d)\s*(?:star|stern|étoile|etoile|estrella|stell|ster)/i);
    if (m) { hist[m[2]] = Number(m[1]); return; }
    m = label.match(/(\d)\s*stars? represent (\d{1,3})%/i);
    if (m) hist[m[1]] = Number(m[2]);
  });
  if (Object.keys(hist).length < 2) {
    const names = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    $('[data-csa-c-content-id^="customerReviews-histogram-"], [id^="customerReviews-histogram-"]').each((_, el) => {
      const id = $(el).attr('data-csa-c-content-id') || $(el).attr('id');
      const star = names[(id.match(/histogram-(one|two|three|four|five)Star/) || [])[1]];
      const v = $(el).find('[aria-valuenow]').attr('aria-valuenow');
      if (star && v !== undefined) hist[star] = Number(v);
    });
  }
  if (Object.keys(hist).length < 2) {
    $('#histogramTable tr, #histogramTable li').each((_, el) => {
      const t = cleanText($(el).text());
      const m = t.match(/(\d)\s*star.*?(\d{1,3})%/i);
      if (m) hist[m[1]] = Number(m[2]);
    });
  }
  if (!Object.keys(hist).length) return null;
  for (let s = 1; s <= 5; s++) hist[s] = hist[s] ?? 0;
  return hist;
}

/**
 * Amazon's AI "Customers say" aspects (visible without sign-in):
 * "57 customers mention performance, 50 positive, 7 negative" + quotes per aspect.
 */
export function parseInsights($) {
  const box = $('[data-cel-widget="cr-product-insights-detail-page"], #cr-product-insights-cards, [data-hook="cr-insights-widget-aspects"]');
  const scope = box.length ? box : $('body');
  const all = cleanText(scope.text());
  const aspects = new Map();
  for (const m of all.matchAll(/(\d+) customers? mentions? "?([^",]{2,60}?)"?, (\d+) positive, (\d+) negative/gi)) {
    const name = m[2].trim().toLowerCase();
    if (!aspects.has(name)) aspects.set(name, { aspect: name, mentions: +m[1], positive: +m[3], negative: +m[4], polarity: null, quotes: [] });
  }
  scope.find('[aria-label$="mentions"], [aria-label$="mention"]').each((_, el) => {
    const m = ($(el).attr('aria-label') || '').match(/^(Positive|Negative|Mixed) aspect, (.+?), (\d+) mentions?/i);
    if (!m) return;
    const name = m[2].trim().toLowerCase();
    const a = aspects.get(name) || { aspect: name, mentions: +m[3], positive: null, negative: null, polarity: null, quotes: [] };
    a.polarity = m[1].toLowerCase();
    aspects.set(name, a);
  });
  scope.find('a[aria-label^="Read more about"]').each((_, el) => {
    const name = ($(el).attr('aria-label') || '').replace(/^Read more about\s*/i, '').trim().toLowerCase();
    const a = aspects.get(name);
    if (!a || a.quotes.length >= 4) return;
    const holder = $(el).closest('[data-csa-c-item-id$="read-more-link"]');
    const quote = cleanText((holder.length ? holder : $(el).parent()).text()).replace(/\s*Read more\s*$/i, '').replace(/^"|"$/g, '').trim();
    const reviewId = (($(el).attr('href') || '').match(/\/(R[A-Z0-9]{8,})/) || [])[1] || null;
    if (quote) a.quotes.push({ text: quote, reviewId });
  });
  for (const a of aspects.values()) {
    if (!a.polarity && a.positive !== null) a.polarity = a.negative > a.positive ? 'negative' : a.negative >= a.positive * 0.4 ? 'mixed' : 'positive';
    if (a.positive !== null) a.negativeShare = a.mentions ? a.negative / a.mentions : 0;
  }
  return [...aspects.values()];
}

/** Review list page (or product page with reviews): reviews, next page, filtered totals. */
export function parseReviewsPage(html, { domain = 'amazon.com', baseUrlOverride } = {}) {
  const $ = cheerio.load(html);
  const nextHref = $('li.a-last:not(.a-disabled) a').attr('href') || null;
  const filterInfo = text($('[data-hook="cr-filter-info-review-rating-count"]'));
  const withReviews = filterInfo.match(/([\d.,\s]+)\s*(?:with reviews|customer reviews|mit Rezensionen|avec avis|con reseñas)/i);
  return {
    reviews: parseReviewNodes($, { domain, baseUrlOverride }),
    hasNext: Boolean(nextHref),
    nextHref,
    hasShowMore: $('[data-hook="show-more-button"]').length > 0,
    filteredTotal: withReviews ? parseCount(withReviews[1]) : parseCount(filterInfo),
    productTitle: text($('[data-hook="product-link"]')) || null,
  };
}

function parseReviewNodes($, { domain, baseUrlOverride }) {
  const out = new Map();
  $('[data-hook="review"], div[id^="customer_review-"], li[id^="R"][class*="review"]').each((_, el) => {
    const $r = $(el);
    if ($r.parents('[data-hook="review"]').length) return; // nested duplicate
    const r = parseReviewNode($, $r, { domain, baseUrlOverride });
    if (r && (r.body || r.title) && !out.has(r.reviewId || `${r.title}|${r.body}`)) out.set(r.reviewId || `${r.title}|${r.body}`, r);
  });
  return [...out.values()];
}

function parseReviewNode($, $r, { domain, baseUrlOverride }) {
  const ownId = ($r.attr('id') || '').replace(/^customer_review(?:_foreign)?-/, '');
  const titleEl = $r.find('[data-hook="review-title"]').first();
  const reviewId = (/^R[A-Z0-9]{6,}$/.test(ownId) ? ownId : null)
    || ((titleEl.attr('href') || '').match(/customer-reviews\/(R[A-Z0-9]+)/) || [])[1]
    || (($r.find('[id^="customer_review-"]').attr('id') || '').match(/(R[A-Z0-9]{6,})/) || [])[1]
    || null;

  const starEl = $r.find('[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"], i[class*="a-star-"]').first();
  let rating = parseStars(text(starEl.find('.a-icon-alt'))) ?? parseStars(text(starEl));
  if (rating === null) {
    const cls = (starEl.attr('class') || '').match(/a-star-(?:mini-)?(\d)/);
    if (cls) rating = Number(cls[1]);
  }

  const t = titleEl.clone();
  t.find('.a-icon-alt, i, .a-letter-space, [data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]').remove();
  const title = cleanText(t.text()) || null;

  const bodyEl = $r.find('[data-hook="review-body"]').first().clone();
  bodyEl.find('script, style, .video-block, .cr-video-desktop, [data-hook="review-body-read-more"], .a-expander-prompt').remove();
  const collapsed = bodyEl.find('[data-hook="review-collapsed"]');
  const body = cleanText((collapsed.length ? collapsed : bodyEl).html() || '').replace(/\s*(Read more|Weiterlesen|Lire la suite|Leer más)\s*$/i, '') || null;

  const dateLine = text($r.find('[data-hook="review-date"]'));
  const helpfulText = text($r.find('[data-hook="helpful-vote-statement"]'));
  const helpful = !helpfulText ? 0 : /\d/.test(helpfulText) ? parseCount(helpfulText) : 1; // "One person found this helpful"
  const variant = text($r.find('[data-hook="format-strip"], [data-hook="format-strip-linkless"]')) || null;
  const full = cleanText($r.text());

  return {
    reviewId,
    rating,
    title,
    body,
    date: parseReviewDate(dateLine),
    country: parseReviewCountry(dateLine),
    author: text($r.find('.a-profile-name')) || null,
    verified: $r.find('[data-hook="avp-badge"], [data-hook="avp-badge-linkless"]').length > 0,
    vine: /Vine (Customer Review|Kundenrezension|Voice)|avis Vine/i.test(full),
    helpful: helpful ?? 0,
    variant,
    images: $r.find('[data-hook="review-image-tile"], .review-image-tile').length,
    url: reviewLink(domain, reviewId, baseUrlOverride),
  };
}
