// Amazon marketplaces, ASIN / URL parsing and the URLs the scraper visits.

export const MARKETPLACES = {
  'amazon.com': { country: 'US', lang: 'en-US,en;q=0.9', currency: 'USD' },
  'amazon.ca': { country: 'CA', lang: 'en-CA,en;q=0.9', currency: 'CAD' },
  'amazon.com.mx': { country: 'MX', lang: 'es-MX,es;q=0.9', currency: 'MXN' },
  'amazon.com.br': { country: 'BR', lang: 'pt-BR,pt;q=0.9', currency: 'BRL' },
  'amazon.co.uk': { country: 'GB', lang: 'en-GB,en;q=0.9', currency: 'GBP' },
  'amazon.de': { country: 'DE', lang: 'de-DE,de;q=0.9,en;q=0.8', currency: 'EUR' },
  'amazon.fr': { country: 'FR', lang: 'fr-FR,fr;q=0.9,en;q=0.8', currency: 'EUR' },
  'amazon.it': { country: 'IT', lang: 'it-IT,it;q=0.9,en;q=0.8', currency: 'EUR' },
  'amazon.es': { country: 'ES', lang: 'es-ES,es;q=0.9,en;q=0.8', currency: 'EUR' },
  'amazon.nl': { country: 'NL', lang: 'nl-NL,nl;q=0.9,en;q=0.8', currency: 'EUR' },
  'amazon.se': { country: 'SE', lang: 'sv-SE,sv;q=0.9,en;q=0.8', currency: 'SEK' },
  'amazon.pl': { country: 'PL', lang: 'pl-PL,pl;q=0.9,en;q=0.8', currency: 'PLN' },
  'amazon.com.tr': { country: 'TR', lang: 'tr-TR,tr;q=0.9,en;q=0.8', currency: 'TRY' },
  'amazon.ae': { country: 'AE', lang: 'en-AE,en;q=0.9,ar;q=0.8', currency: 'AED' },
  'amazon.sa': { country: 'SA', lang: 'en-SA,en;q=0.9,ar;q=0.8', currency: 'SAR' },
  'amazon.eg': { country: 'EG', lang: 'en-EG,en;q=0.9,ar;q=0.8', currency: 'EGP' },
  'amazon.in': { country: 'IN', lang: 'en-IN,en;q=0.9', currency: 'INR' },
  'amazon.co.jp': { country: 'JP', lang: 'ja-JP,ja;q=0.9,en;q=0.8', currency: 'JPY' },
  'amazon.sg': { country: 'SG', lang: 'en-SG,en;q=0.9', currency: 'SGD' },
  'amazon.com.au': { country: 'AU', lang: 'en-AU,en;q=0.9', currency: 'AUD' },
};

export const ASIN_RE = /^[A-Z0-9]{10}$/;

/**
 * Accepts an ASIN ("B0BSHF7WHW"), "amazon.de:B0BSHF7WHW", or any Amazon product / review URL
 * (/dp/, /gp/product/, /product-reviews/, /portal/customer-reviews/, amzn short links are not resolvable offline).
 */
export function parseTarget(input, defaultDomain = 'amazon.com') {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Empty product target');
  const upper = raw.toUpperCase();
  if (ASIN_RE.test(upper)) return { asin: upper, domain: defaultDomain };
  const pref = raw.match(/^((?:www\.)?amazon\.[a-z.]+):([A-Za-z0-9]{10})$/i);
  if (pref) return { asin: pref[2].toUpperCase(), domain: pref[1].toLowerCase().replace(/^www\./, '') };
  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new Error(`Not an ASIN or Amazon URL: ${raw}`); }
  const host = url.hostname.toLowerCase().replace(/^(www|smile|m)\./, '');
  const m = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|product-reviews|portal\/customer-reviews|gp\/customer-reviews\/aj\/private\/reviewsGallery\/get-application-json)\/([A-Za-z0-9]{10})(?:[/?]|$)/i)
    || url.pathname.match(/\/([A-Z0-9]{10})(?:[/?]|$)/);
  if (!m) throw new Error(`No ASIN found in URL: ${raw}`);
  const domain = /^amazon\./.test(host) ? host : defaultDomain;
  return { asin: m[1].toUpperCase(), domain };
}

export const productKey = ({ asin, domain }) => `${domain}:${asin}`;

export function baseUrl(domain, override) {
  return (override || `https://www.${domain}`).replace(/\/+$/, '');
}

export function productUrl(t, override) {
  return `${baseUrl(t.domain, override)}/dp/${t.asin}`;
}

export const STAR_FILTERS = { 1: 'one_star', 2: 'two_star', 3: 'three_star', 4: 'four_star', 5: 'five_star' };

export function reviewsUrl(t, { star, sortBy = 'recent', page = 1 } = {}, override) {
  const q = new URLSearchParams({ ie: 'UTF8', reviewerType: 'all_reviews', sortBy, pageNumber: String(page) });
  if (star) q.set('filterByStar', STAR_FILTERS[star] || star);
  return `${baseUrl(t.domain, override)}/product-reviews/${t.asin}/?${q}`;
}

export function reviewLink(domain, reviewId, override) {
  return reviewId ? `${baseUrl(domain, override)}/gp/customer-reviews/${reviewId}` : null;
}

/** "critical" -> [1,2,3]; "all" -> [1..5]; "1,2" -> [1,2]; "positive" -> [4,5] */
export function parseStarsOption(v) {
  const s = String(v || 'critical').toLowerCase();
  if (s === 'all') return [1, 2, 3, 4, 5];
  if (s === 'critical') return [1, 2, 3];
  if (s === 'positive') return [4, 5];
  const list = s.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 5);
  if (!list.length) throw new Error(`Bad --stars value: ${v} (use critical, all, positive or e.g. 1,2)`);
  return [...new Set(list)].sort();
}
