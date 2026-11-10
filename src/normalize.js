// One review shape for every source (Amazon pages, saved HTML, CSV/JSON exports).
import { cleanText, fingerprint, sha1 } from './util.js';

export function makeReview(raw, { productKey, source = 'amazon' }) {
  const title = cleanText(raw.title || '') || null;
  const body = cleanText(raw.body || '') || null;
  const rating = raw.rating === null || raw.rating === undefined || raw.rating === '' ? null : Math.round(Number(raw.rating));
  const fp = fingerprint(`${title || ''} ${body || ''}`);
  const id = raw.reviewId ? `${productKey}:${raw.reviewId}` : `${productKey}:h${sha1(`${fp}|${raw.author || ''}|${raw.date || ''}`).slice(0, 12)}`;
  return {
    id,
    productKey,
    reviewId: raw.reviewId || null,
    rating: rating >= 1 && rating <= 5 ? rating : null,
    title,
    body,
    date: raw.date || null,
    country: raw.country || null,
    author: raw.author || null,
    verified: raw.verified === undefined ? null : Boolean(raw.verified),
    vine: Boolean(raw.vine),
    helpful: Number(raw.helpful) || 0,
    variant: raw.variant || null,
    images: Number(raw.images) || 0,
    url: raw.url || null,
    source,
    fingerprint: fp,
    collectedAt: raw.collectedAt || new Date().toISOString(),
  };
}

/** Text the analyzers read (title carries a lot of the signal on Amazon). */
export const reviewText = (r) => [r.title, r.body].filter(Boolean).join('. ').slice(0, 2500);

/** Stable cache key: same text + rating = same analysis, whatever product or run it came from. */
export const analysisHash = (r, version) => sha1(`${version}|${r.rating ?? ''}|${reviewText(r)}`);
