// Offline demo: a seeded sample niche (32 oz insulated bottles) served by a fake Amazon store that uses
// Amazon's real markup (data-hook attributes, pagination, histogram, "Customers say" aspects).
// The demo and the tests run the real scraper + parser against it, with no network.
import http from 'node:http';

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const FLAW_TEXT = {
  leaks: ['The lid leaks every time I put it in my bag, soaked my laptop.', 'It leaked all over my car seat on day two.', 'Started leaking around the lid after a month.', 'Leaks from the threads unless you crank it shut.'],
  'finish-defects': ['The paint chipped after the first drop.', 'Powder coating is peeling off near the base already.', 'Paint chips way too easily, looks old after two weeks.'],
  'lid-or-closure': ['The lid is hard to open and the hinge feels weak.', 'The flip cap broke off after three weeks.', 'The straw lid won\'t stay closed.'],
  'hard-to-clean': ['Impossible to clean the straw lid, mold grows inside within a week.', 'Hard to clean, gunk builds up in the lid.'],
  'poor-temperature-retention': ['Does not keep water cold more than 3 hours, ice melts by lunch.', 'Coffee is lukewarm after two hours, not insulated at all.', 'It doesn\'t keep drinks cold like advertised.'],
  'arrived-damaged': ['Arrived dented on the side, box was crushed.', 'Came damaged with a big dent near the bottom.'],
  'bad-taste': ['Water has a metallic taste even after washing it five times.', 'Everything tastes like metal from this bottle.'],
  'poor-support': ['Customer service never responded to my emails about the leak.', 'Seller was unresponsive, no reply after two weeks.'],
  'broke-quickly': ['The handle snapped off after a week.', 'The carry loop cracked the first time I used it.', 'Bottom cracked after a small drop, junk.'],
  'bad-smell': ['Strong plastic smell from the lid that won\'t go away.', 'The lid has a weird chemical smell.'],
  heavy: ['Way too heavy to carry around all day.', 'Much heavier than I thought, too heavy for my kids.'],
  'missing-parts': ['The straw lid was missing from the box.', 'Missing the second lid that is shown in the pictures.'],
  overpriced: ['Way too expensive for what you get.', 'Not worth the money compared to cheaper bottles.'],
};
const PRAISE_TEXT = [
  'Keeps my water ice cold all day at work.', 'Looks great and the color is beautiful.', 'Easy to clean and fits my cup holder.',
  'Great value for the price.', 'Well made and sturdy, survived a few drops.', 'No leaks so far, even upside down in my bag.', 'Love it, works great.',
];
const TITLES = { 1: ['Do not buy', 'Huge disappointment', 'Junk', 'Returned it'], 2: ['Not great', 'Disappointed', 'Expected better'], 3: ['It is okay', 'Mixed feelings', 'Decent but flawed'], 4: ['Pretty good', 'Good bottle', 'Nice, with one issue'], 5: ['Love it!', 'Perfect bottle', 'Best bottle I have owned'] };

export const DEMO_NICHE = '32 oz insulated water bottles';
export const DEMO_PRODUCTS = [
  { asin: 'B0DEMO0001', title: 'HydroPeak 32 oz Insulated Water Bottle with Straw Lid, Stainless Steel', brand: 'HydroPeak', label: 'HydroPeak 32 oz', price: '$34.95', rating: 4.3, ratingsCount: 18432, hist: { 5: 62, 4: 14, 3: 8, 2: 6, 1: 10 }, n: 120, seed: 11,
    flaws: { leaks: 9, 'finish-defects': 5, 'lid-or-closure': 4, 'hard-to-clean': 3, overpriced: 1 }, rising: 'leaks',
    summary: 'Customers like how cold this bottle keeps drinks and its look. However, many report the lid leaking and paint chipping.',
    insights: [['temperature retention', 412, 380, 32], ['leak resistance', 298, 104, 194], ['durability', 221, 120, 101], ['appearance', 180, 171, 9], ['ease of cleaning', 96, 41, 55]] },
  { asin: 'B0DEMO0002', title: 'ThermoFlask Pro 32oz Vacuum Insulated Bottle, Leakproof Chug Lid', brand: 'ThermoFlask', label: 'ThermoFlask Pro', price: '$27.99', rating: 4.1, ratingsCount: 9211, hist: { 5: 55, 4: 15, 3: 10, 2: 7, 1: 13 }, n: 100, seed: 22,
    flaws: { 'poor-temperature-retention': 9, 'arrived-damaged': 4, 'bad-taste': 3, leaks: 3, 'poor-support': 2 }, rising: 'poor-temperature-retention',
    summary: 'Customers find the bottle good value and easy to clean, but opinions are mixed on insulation; some say drinks warm up within hours.',
    insights: [['value for money', 210, 180, 30], ['insulation', 260, 98, 162], ['taste', 88, 20, 68], ['ease of cleaning', 120, 110, 10]] },
  { asin: 'B0DEMO0003', title: 'AquaSteel Basic 32 oz Stainless Steel Bottle with Handle', brand: 'AquaSteel', label: 'AquaSteel Basic', price: '$19.99', rating: 3.9, ratingsCount: 4410, hist: { 5: 48, 4: 15, 3: 11, 2: 9, 1: 17 }, n: 100, seed: 33,
    flaws: { 'broke-quickly': 7, leaks: 6, 'bad-smell': 3, heavy: 3, 'missing-parts': 2 },
    summary: 'Customers appreciate the low price. Some report the handle breaking, leaks and a plastic smell from the lid.',
    insights: [['price', 150, 128, 22], ['durability', 170, 52, 118], ['leak resistance', 130, 61, 69], ['weight', 60, 18, 42]] },
  { asin: 'B0DEMO0004', title: 'Summit 32 oz Insulated Bottle – Triple Wall, Leak-Tested Lid', brand: 'Summit', label: 'Summit (your brand)', price: '$32.00', rating: 4.5, ratingsCount: 1290, hist: { 5: 71, 4: 14, 3: 6, 2: 4, 1: 5 }, n: 70, seed: 44, own: true,
    flaws: { 'finish-defects': 6, heavy: 3, leaks: 1 },
    summary: 'Customers love the insulation and say the lid does not leak. A few mention the coating scratching.',
    insights: [['insulation', 140, 133, 7], ['leak resistance', 90, 84, 6], ['appearance', 70, 52, 18]] },
];

const REF = Date.parse('2026-10-31T00:00:00Z');

export function generateDemoReviews(p) {
  const r = rng(p.seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const weighted = (obj) => { const tot = Object.values(obj).reduce((s, x) => s + x, 0); let x = r() * tot; for (const [k, w] of Object.entries(obj)) { x -= w; if (x <= 0) return k; } return Object.keys(obj)[0]; };
  const starMix = p.own ? { 1: 8, 2: 8, 3: 14, 4: 30, 5: 40 } : { 1: 30, 2: 20, 3: 20, 4: 15, 5: 15 };
  const out = [];
  for (let i = 0; i < p.n; i++) {
    const rating = Number(weighted(starMix));
    const parts = [];
    let rising = false;
    if (rating <= 3 || r() < 0.18) {
      const k = weighted(p.flaws);
      rising = k === p.rising;
      parts.push(pick(FLAW_TEXT[k]));
      if (rating <= 2 && r() < 0.45) { const k2 = weighted(p.flaws); if (k2 !== k) parts.push(pick(FLAW_TEXT[k2])); }
      if (rating === 1 && r() < 0.5) parts.push('Returned it for a refund.');
    }
    if (rating >= 3) parts.unshift(pick(PRAISE_TEXT));
    // Rising flaw: mostly in the last 90 days.
    const daysAgo = rising ? (r() < 0.75 ? r() * 85 : 90 + r() * 270) : r() * 360;
    const date = new Date(REF - daysAgo * 86_400_000).toISOString().slice(0, 10);
    out.push({
      reviewId: `R${p.asin.slice(-4)}${String(i).padStart(4, '0')}DEMO`,
      rating, title: pick(TITLES[rating]), body: parts.join(' '), date,
      author: `Buyer ${i + 1}`, verified: r() < 0.85, helpful: r() < 0.3 ? Math.floor(r() * 60) : 0,
      variant: `Color: ${pick(['Black', 'Sage', 'Ocean', 'White'])}`,
    });
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const US = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function renderReviewHtml(rv) {
  return `<li data-hook="review" id="${rv.reviewId}" class="review aok-relative"><div id="customer_review-${rv.reviewId}" class="a-section celwidget">
<div class="a-profile-content"><span class="a-profile-name">${esc(rv.author)}</span></div>
<a class="a-link-normal" href="/gp/customer-reviews/${rv.reviewId}/ref=cm_cr_arp_d_rvw_ttl" data-hook="review-title"><i data-hook="review-star-rating" class="a-icon a-icon-star a-star-${rv.rating} review-rating"><span class="a-icon-alt">${rv.rating}.0 out of 5 stars</span></i><span class="a-letter-space"></span><span>${esc(rv.title)}</span></a>
<span data-hook="review-date" class="a-size-base a-color-secondary review-date">Reviewed in the United States on ${US(rv.date)}</span>
<div class="a-row review-format-strip"><span data-hook="format-strip-linkless" class="a-color-secondary">${esc(rv.variant)}</span>${rv.verified ? '<span data-hook="avp-badge-linkless" class="a-size-mini a-color-state a-text-bold">Verified Purchase</span>' : ''}</div>
<span data-hook="review-body" class="a-size-base review-text review-text-content"><span>${esc(rv.body)}</span></span>
${rv.helpful ? `<span data-hook="helpful-vote-statement" class="a-size-base a-color-tertiary cr-vote-text">${rv.helpful === 1 ? 'One person found this helpful' : `${rv.helpful} people found this helpful`}</span>` : ''}
</div></li>`;
}

export function renderProductHtml(p, reviews = []) {
  const ins = p.insights.map(([a, m, pos, neg]) => `<div><span role="button" aria-label="${neg > pos ? 'Negative' : neg ? 'Mixed' : 'Positive'} aspect, ${a}, ${m} mentions">${a}(${m})</span><div>${m} customers mention ${a}, ${pos} positive, ${neg} negative</div></div>`).join('');
  return `<!doctype html><html><head><title>Amazon.com: ${esc(p.title)}</title><link rel="canonical" href="https://www.amazon.com/dp/${p.asin}"></head><body>
<span id="productTitle" class="a-size-large product-title-word-break">  ${esc(p.title)}  </span>
<a id="bylineInfo" href="#">Visit the ${esc(p.brand)} Store</a>
<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">${p.price}</span></span></div>
<span id="acrPopover" title="${p.rating} out of 5 stars"></span><span data-hook="total-review-count">${p.ratingsCount.toLocaleString('en-US')} global ratings</span>
<span data-hook="rating-out-of-text">${p.rating} out of 5</span>
<ul id="histogramTable">${[5, 4, 3, 2, 1].map((s) => `<li><a aria-label="${p.hist[s]} percent of reviews have ${s} stars" href="#">${s} star ${p.hist[s]}%</a></li>`).join('')}</ul>
<div data-cel-widget="cr-product-insights-detail-page"><h3>Customers say</h3><div data-testid="overall-summary">${esc(p.summary)}</div>${ins}</div>
<div id="cm-cr-dp-review-list">${reviews.slice(0, 8).map(renderReviewHtml).join('')}</div>
</body></html>`;
}

export function renderReviewsListHtml(p, reviews, { page, perPage = 10, star }) {
  const slice = reviews.slice((page - 1) * perPage, page * perPage);
  const hasNext = page * perPage < reviews.length;
  return `<!doctype html><html><head><title>Amazon.com: Customer reviews: ${esc(p.title)}</title></head><body>
<a data-hook="product-link" href="/dp/${p.asin}">${esc(p.title)}</a>
<div data-hook="cr-filter-info-review-rating-count">${reviews.length} total ratings, ${reviews.length} with reviews${star ? ` (${star})` : ''}</div>
<div id="cm_cr-review_list"><ul>${slice.map(renderReviewHtml).join('')}</ul></div>
<ul class="a-pagination"><li class="a-last${hasNext ? '' : ' a-disabled'}">${hasNext ? `<a href="?pageNumber=${page + 1}">Next page</a>` : 'Next page'}</li></ul>
</body></html>`;
}

const STAR_NUM = { one_star: 1, two_star: 2, three_star: 3, four_star: 4, five_star: 5 };

/** Fake Amazon on 127.0.0.1. `walled: true` makes review pages redirect to sign-in like the real site. */
export function startFakeAmazon({ products = DEMO_PRODUCTS, walled = false, captcha = false } = {}) {
  const data = new Map(products.map((p) => [p.asin, { p, reviews: generateDemoReviews(p) }]));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (status, html, headers = {}) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers }); res.end(html); };
    if (captcha) return send(200, '<html><body><form action="/errors/validateCaptcha">Type the characters you see in this image</form></body></html>');
    if (u.pathname.startsWith('/ax/claim')) return send(200, '<html><head><title>Amazon Sign-In</title></head><body><form name="signIn">Sign in</form></body></html>');
    let m = u.pathname.match(/^\/dp\/([A-Z0-9]{10})/);
    if (m) {
      const d = data.get(m[1]);
      return d ? send(200, renderProductHtml(d.p)) : send(404, '<html><head><title>Page Not Found</title></head></html>');
    }
    m = u.pathname.match(/^\/product-reviews\/([A-Z0-9]{10})/);
    if (m) {
      if (walled) return send(302, '', { location: '/ax/claim?arb=demo' });
      const d = data.get(m[1]);
      if (!d) return send(404, '<html><head><title>Page Not Found</title></head></html>');
      const star = STAR_NUM[u.searchParams.get('filterByStar')];
      const list = star ? d.reviews.filter((r) => r.rating === star) : d.reviews;
      return send(200, renderReviewsListHtml(d.p, list, { page: Number(u.searchParams.get('pageNumber')) || 1, star: u.searchParams.get('filterByStar') }));
    }
    send(404, '<html><head><title>Page Not Found</title></head></html>');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    resolve({ url, data, close: () => new Promise((r) => server.close(r)) });
  }));
}
