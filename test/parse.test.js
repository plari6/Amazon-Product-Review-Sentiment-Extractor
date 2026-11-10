import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseStarsOption, parseTarget, reviewsUrl } from '../src/amazon/marketplaces.js';
import { detectBlock, parseProductPage, parseReviewsPage } from '../src/amazon/parse.js';
import { DEMO_PRODUCTS, renderProductHtml } from '../src/demo.js';
import { parseCsv, parseReviewDate, parseStars, toCsv } from '../src/util.js';

const page = fs.readFileSync(new URL('./fixtures/reviews-page.html', import.meta.url), 'utf8');

test('parses review list: US + international markup, helpful votes, pagination, totals', () => {
  const r = parseReviewsPage(page, { domain: 'amazon.com' });
  assert.equal(r.reviews.length, 3);
  assert.equal(r.hasNext, true);
  assert.equal(r.filteredTotal, 456);
  const [a, b, c] = r.reviews;
  assert.equal(a.reviewId, 'R1AAAAAAAAAAAA');
  assert.equal(a.rating, 1);
  assert.equal(a.title, 'Motor died after two weeks');
  assert.match(a.body, /stopped working after two weeks\.\nThe lid also leaks/);
  assert.equal(a.date, '2025-03-03');
  assert.equal(a.country, 'United States');
  assert.equal(a.verified, true);
  assert.equal(a.helpful, 23);
  assert.equal(a.variant, 'Color: Mint');
  assert.equal(a.url, 'https://www.amazon.com/gp/customer-reviews/R1AAAAAAAAAAAA');
  assert.equal(b.title, 'Love it & use it daily');
  assert.equal(b.helpful, 1);
  assert.equal(b.verified, false);
  assert.equal(c.rating, 2);
  assert.equal(c.title, 'Leider undicht');
  assert.equal(c.date, '2025-01-07');
  assert.equal(c.reviewId, 'R3CCCCCCCCCCCC');
});

test('parses product page: rating, count, histogram, summary, Amazon aspects', () => {
  const p = parseProductPage(renderProductHtml(DEMO_PRODUCTS[0]));
  assert.equal(p.title, DEMO_PRODUCTS[0].title);
  assert.equal(p.brand, 'HydroPeak');
  assert.equal(p.price, '$34.95');
  assert.equal(p.rating, 4.3);
  assert.equal(p.ratingsCount, 18432);
  assert.deepEqual(p.histogram, { 1: 10, 2: 6, 3: 8, 4: 14, 5: 62 });
  assert.match(p.summary, /lid leaking/);
  const leak = p.insights.find((a) => a.aspect === 'leak resistance');
  assert.deepEqual([leak.mentions, leak.positive, leak.negative, leak.polarity], [298, 104, 194, 'negative']);
});

test('detects sign-in walls, captchas, blocks and missing pages', () => {
  assert.equal(detectBlock({ url: 'https://www.amazon.com/ax/claim?arb=1', html: '' }), 'signin');
  assert.equal(detectBlock({ url: 'https://www.amazon.com/ap/signin?x', html: '' }), 'signin');
  assert.equal(detectBlock({ html: '<form action="/errors/validateCaptcha">Type the characters you see in this image</form>' }), 'captcha');
  assert.equal(detectBlock({ status: 503, html: '' }), 'blocked');
  assert.equal(detectBlock({ status: 404, html: '' }), 'not_found');
  assert.equal(detectBlock({ html: page }), null);
});

test('parses ASINs and URLs from every marketplace', () => {
  assert.deepEqual(parseTarget('b0bshf7whw'), { asin: 'B0BSHF7WHW', domain: 'amazon.com' });
  assert.deepEqual(parseTarget('https://www.amazon.de/Some-Product/dp/B0BSHF7WHW/ref=sr_1_1?th=1'), { asin: 'B0BSHF7WHW', domain: 'amazon.de' });
  assert.deepEqual(parseTarget('amazon.co.uk/product-reviews/B0BSHF7WHW'), { asin: 'B0BSHF7WHW', domain: 'amazon.co.uk' });
  assert.deepEqual(parseTarget('https://www.amazon.ae/gp/product/B0BSHF7WHW'), { asin: 'B0BSHF7WHW', domain: 'amazon.ae' });
  assert.deepEqual(parseTarget('amazon.sa:B0BSHF7WHW'), { asin: 'B0BSHF7WHW', domain: 'amazon.sa' });
  assert.throws(() => parseTarget('https://example.com/whatever'), /No ASIN/);
  assert.match(reviewsUrl({ asin: 'B0BSHF7WHW', domain: 'amazon.com' }, { star: 1, page: 2 }), /product-reviews\/B0BSHF7WHW\/\?.*sortBy=recent.*pageNumber=2.*filterByStar=one_star/);
  assert.deepEqual(parseStarsOption('critical'), [1, 2, 3]);
  assert.deepEqual(parseStarsOption('2,1,9'), [1, 2]);
  assert.throws(() => parseStarsOption('none'));
});

test('dates, stars and CSV helpers handle several languages and separators', () => {
  assert.equal(parseReviewDate('Reviewed in the United Kingdom on 3 March 2025'), '2025-03-03');
  assert.equal(parseReviewDate('Commenté en France le 12 décembre 2024'), '2024-12-12');
  assert.equal(parseReviewDate('Revisado en España el 5 de mayo de 2025'), '2025-05-05');
  assert.equal(parseReviewDate('2025-02-01T10:00:00Z'), '2025-02-01');
  assert.equal(parseStars('4,0 von 5 Sternen'), 4);
  const rows = parseCsv('﻿Rating;Body\n5;"Great; really ""great"""\n1;Bad\n');
  assert.deepEqual(rows, [{ Rating: '5', Body: 'Great; really "great"' }, { Rating: '1', Body: 'Bad' }]);
  assert.equal(toCsv([{ a: '=HYPERLINK("x")', b: 'x;y' }]), '﻿a;b\r\n"\'=HYPERLINK(""x"")";"x;y"\r\n');
});
