import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { loadSettings } from '../src/config.js';
import { startFakeAmazon } from '../src/demo.js';
import { importFile } from '../src/importer.js';
import { Collector } from '../src/scraper.js';
import { openStore } from '../src/store.js';
import { tmpDir } from './helpers.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');

function settingsFor(url, dir) {
  const s = loadSettings({ PAGE_DELAY_MS: '0', PRODUCT_DELAY_MS: '0' }, { dataDir: dir });
  s.baseUrlOverride = url;
  s.profileDir = path.join(dir, 'no-profile');
  return s;
}

test('scraper walks star filters and pages on the fake store and stores product stats + reviews', async () => {
  const fake = await startFakeAmazon();
  const store = openStore(null, { memory: true });
  const c = new Collector({ settings: settingsFor(fake.url, tmpDir()), store });
  try {
    const r = await c.collect('B0DEMO0002', { maxReviews: 1000, stars: 'all', engine: 'http', label: 'Thermo' });
    assert.equal(r.status, 'ok');
    assert.equal(r.seen, 100);
    assert.equal(r.added, 100);
    const p = store.product('amazon.com:B0DEMO0002');
    assert.equal(p.label, 'Thermo');
    assert.equal(p.rating, 4.1);
    assert.equal(p.insights.length, 4);
    const rv = store.reviews(p.key);
    assert.ok(rv.every((x) => x.url.startsWith('https://www.amazon.com/gp/customer-reviews/R')));
    // critical-only with a budget
    const r2 = await c.collect('B0DEMO0001', { maxReviews: 30, stars: 'critical', engine: 'http' });
    assert.ok(r2.seen >= 28 && r2.seen <= 32, `seen ${r2.seen}`);
    assert.ok(store.reviews('amazon.com:B0DEMO0001').every((x) => x.rating <= 3));
    const missing = await c.collect('B0NOTHERE1', { engine: 'http' });
    assert.equal(missing.status, 'not_found');
  } finally { await c.close(); await fake.close(); }
});

test('sign-in wall: product stats are kept and the user is told to log in', async () => {
  const fake = await startFakeAmazon({ walled: true });
  const store = openStore(null, { memory: true });
  const c = new Collector({ settings: settingsFor(fake.url, tmpDir()), store });
  try {
    const r = await c.collect('B0DEMO0003', { engine: 'auto' });
    assert.equal(r.status, 'login_needed');
    assert.match(r.notes[0], /login/);
    const p = store.product('amazon.com:B0DEMO0003');
    assert.ok(p.insights.length > 0 && p.histogram);
  } finally { await c.close(); await fake.close(); }
});

test('captcha over HTTP with engine=http is reported as blocked, never stored as data', async () => {
  const fake = await startFakeAmazon({ captcha: true });
  const store = openStore(null, { memory: true });
  const c = new Collector({ settings: settingsFor(fake.url, tmpDir()), store });
  try {
    const r = await c.collect('B0DEMO0001', { engine: 'http' });
    assert.equal(r.status, 'blocked');
    assert.equal(store.products().length, 0);
  } finally { await c.close(); await fake.close(); }
});

test('imports Helium 10 style CSV, Apify style JSON and saved HTML pages', () => {
  const dir = tmpDir();
  const store = openStore(null, { memory: true });
  const csv = path.join(dir, 'h10.csv');
  fs.writeFileSync(csv, '﻿Date;Author;Verified;Helpful;Title;Body;Rating;Variation\n"March 3, 2025";Ann;yes;12;Leaks;"The lid leaks; returned";1;Color: Blue\n"March 4, 2025";Bo;no;0;;;5;\n');
  const r1 = importFile(csv, store, { asin: 'B0ACME1234' });
  assert.equal(r1.products[0].key, 'amazon.com:B0ACME1234');
  assert.equal(r1.products[0].added, 1);
  assert.equal(r1.skipped, 1);
  const rv = store.reviews('amazon.com:B0ACME1234')[0];
  assert.deepEqual([rv.rating, rv.date, rv.verified, rv.helpful, rv.variant], [1, '2025-03-03', true, 12, 'Color: Blue']);

  const json = path.join(dir, 'apify.json');
  fs.writeFileSync(json, JSON.stringify([
    { productAsin: 'B0OTHER123', ratingScore: 2, reviewTitle: 'Meh', reviewDescription: 'Too loud', date: 'Reviewed in the United States on May 5, 2025', reviewId: 'R9ZZZZZZZZ', isVerified: true },
    { productAsin: 'B0OTHER456', ratingScore: 4, reviewTitle: 'Nice', reviewDescription: 'Works great' },
  ]));
  const r2 = importFile(json, store, {});
  assert.equal(r2.products.length, 2);
  assert.equal(store.reviews('amazon.com:B0OTHER123')[0].url, 'https://www.amazon.com/gp/customer-reviews/R9ZZZZZZZZ');

  const r3 = importFile(path.join(ROOT, 'test/fixtures/reviews-page.html'), store, {});
  assert.equal(r3.products[0].key, 'amazon.com:B0ACME1234');
  assert.equal(r3.products[0].added, 3);
  // re-import is idempotent
  assert.equal(importFile(path.join(ROOT, 'test/fixtures/reviews-page.html'), store, {}).products[0].added, 0);
});

test('CLI demo runs offline and writes every report', async () => {
  const out = tmpDir('rse-out');
  const res = spawnSync(process.execPath, [path.join(ROOT, 'bin/review-extractor.js'), '--no-ai', '-o', out, 'demo'], {
    encoding: 'utf8', env: { ...process.env, REVIEW_EXTRACTOR_SKIP_DOTENV: '1', GEMINI_API_KEY: '' }, timeout: 120000,
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stderr, /Top opportunities/);
  for (const f of ['demo.xlsx', 'demo.html', 'demo.md', 'demo-reviews.csv', 'demo-flaws.csv', 'demo.json']) assert.ok(fs.existsSync(path.join(out, f)), f);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(out, 'demo.xlsx'));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Summary', 'Opportunities', 'Flaws', 'Matrix', 'Praise', 'Amazon aspects', 'Reviews']);
  assert.ok(wb.getWorksheet('Reviews').rowCount > 300);
  const html = fs.readFileSync(path.join(out, 'demo.html'), 'utf8');
  assert.match(html, /Opportunities/);
  assert.doesNotMatch(html, /undefined|NaN/);
  const json = JSON.parse(fs.readFileSync(path.join(out, 'demo.json'), 'utf8'));
  assert.equal(json.market.opportunities[0].key, 'leaks');
});

test('CLI classify works without keys', () => {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'bin/review-extractor.js'), '--no-ai', 'classify', 'The zipper broke after two days', '-r', '1'], { encoding: 'utf8', env: { ...process.env, REVIEW_EXTRACTOR_SKIP_DOTENV: '1' } });
  assert.equal(res.status, 0, res.stderr);
  const a = JSON.parse(res.stdout);
  assert.ok(a.flaws.some((f) => f.key === 'lid-or-closure' || f.key === 'broke-quickly'));
});
