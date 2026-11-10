import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateMarket, aggregateProduct } from '../src/analyze/aggregate.js';
import { writeBrief, templateBrief, briefInput } from '../src/analyze/brief.js';
import { analyzeReviews, parseBatch, quoteInText } from '../src/analyze/classifier.js';
import { analyzeWithRules } from '../src/analyze/rules.js';
import { canonicalKey } from '../src/analyze/taxonomy.js';
import { makeReview } from '../src/normalize.js';
import { openStore } from '../src/store.js';
import { fakeAi } from './helpers.js';

const keys = (a) => a.flaws.map((f) => f.key).sort();
const R = (body, rating, extra = {}) => makeReview({ body, rating, ...extra }, { productKey: extra.pk || 'amazon.com:B0TEST0001' });

test('rules find specific flaws and praises', () => {
  const a = analyzeWithRules(R('The lid leaks in my bag and the paint chipped after a week. Returned it.', 1));
  assert.deepEqual(keys(a), ['finish-defects', 'leaks']);
  assert.equal(a.sentiment, 'negative');
  assert.equal(a.returnRisk, true);
  assert.ok(a.flaws.every((f) => f.severity >= 3));
  const p = analyzeWithRules(R('Keeps my water ice cold all day. Easy to clean. Great value!', 5));
  assert.deepEqual(keys(p), []);
  assert.deepEqual(p.praises.map((x) => x.key).sort(), ['easy-to-use', 'great-value', 'keeps-temperature']);
  assert.equal(p.sentiment, 'positive');
});

test('rules ignore negated, hedged and look-alike words', () => {
  assert.deepEqual(keys(analyzeWithRules(R('No leaks so far, it does not leak even upside down.', 5))), []);
  assert.deepEqual(keys(analyzeWithRules(R('I was worried it would leak like my old bottle but it is perfect.', 5))), []);
  assert.deepEqual(keys(analyzeWithRules(R('Love the color, looks great. Huge fan!', 5))), []);
  assert.deepEqual(keys(analyzeWithRules(R('Keeps it cold for hours, the ice melts slowly.', 5))), []);
});

test('rules read German / French / Spanish complaints', () => {
  assert.ok(keys(analyzeWithRules(R('Der Deckel ist undicht und der Mixer ist zu laut.', 2))).includes('leaks'));
  assert.ok(keys(analyzeWithRules(R('Der Deckel ist undicht und der Mixer ist zu laut.', 2))).includes('too-loud'));
  assert.ok(keys(analyzeWithRules(R('Produit défectueux, ne marche pas.', 1))).includes('defective-on-arrival'));
  assert.ok(keys(analyzeWithRules(R('Se rompió a la semana.', 1))).includes('broke-quickly'));
});

test('canonical keys merge AI synonyms into taxonomy keys', () => {
  assert.equal(canonicalKey('Lid Leaks'), 'leaks');
  assert.equal(canonicalKey('battery_drains_fast'), 'short-battery-life');
  assert.equal(canonicalKey("Doesn't keep cold"), 'poor-temperature-retention');
  assert.equal(canonicalKey('weird-new-issue'), 'weird-new-issue');
});

test('parseBatch validates model JSON and guards against invented quotes', () => {
  const batch = [R('The handle snapped after a week.', 1), R('Great bottle.', 5)];
  const out = parseBatch('```json\n{"reviews":[{"id":"r1","sentiment":"negative","score":-0.9,"flaws":[{"key":"Handle Broke","label":"Handle snaps","category":"durability","severity":9,"quote":"The handle snapped after a week"},{"key":"x","category":"nonsense","quote":"invented sentence about fire"}]},{"id":"r2","sentiment":"positive","score":0.9}]}\n```', batch);
  const f = out.get(0).flaws;
  assert.equal(f[0].severity, 5);
  assert.equal(f[0].category, 'durability');
  assert.ok(f[0].quote);
  assert.equal(f[1].category, 'other');
  assert.equal(f[1].quote, null);
  assert.throws(() => parseBatch('not json', batch));
  assert.throws(() => parseBatch('{"reviews":[]}', batch), /only 0\/2/);
  assert.equal(quoteInText('handle SNAPPED after', 'The handle snapped after a week.'), true);
});

test('AI batches: bad JSON moves to the next model, total failure falls back to rules, results are cached', async () => {
  const store = openStore(null, { memory: true });
  const reviews = Array.from({ length: 7 }, (_, i) => R(`Review ${i}: the lid leaks badly.`, 1));
  const ai = fakeAi((model, req) => {
    if (model === 'model-a') return 'sorry, I cannot';
    return (async () => (await import('./helpers.js')).rulesAnswer(req.messages.at(-1).content))();
  });
  const settings = { aiBatchSize: 3, aiConcurrency: 2 };
  const { results, stats } = await analyzeReviews(reviews, { ai, store, settings });
  assert.equal(results.size, 7);
  assert.equal(stats.ai, 7);
  assert.ok([...results.values()].every((a) => a.by === 'ai:fake:model-b' && a.flaws[0].key === 'leaks'));
  const again = await analyzeReviews(reviews, { ai, store, settings });
  assert.equal(again.stats.cached, 7);

  const dead = fakeAi(() => { throw Object.assign(new Error('503 overloaded'), { status: 503 }); });
  const r2 = await analyzeReviews([R('It broke after a week.', 1)], { ai: dead, store: openStore(null, { memory: true }), settings });
  assert.equal(r2.stats.rules, 1);
  assert.equal(r2.stats.failedBatches, 1);
  assert.equal([...r2.results.values()][0].flaws[0].key, 'broke-quickly');
});

function dataset() {
  const prod = (key, label, own = false) => ({ key, label, own, histogram: { 1: 10, 2: 5, 3: 5, 4: 20, 5: 60 } });
  const make = (pk, n, flawText, flawEvery, recent = false) => Array.from({ length: n }, (_, i) => R(
    i % flawEvery === 0 ? `${flawText} Review ${i}` : `Works great, love it. Review ${i}`,
    i % flawEvery === 0 ? 1 : 5,
    { pk, helpful: i % 7, verified: true, date: new Date(Date.parse('2026-10-01') - (recent && i % flawEvery === 0 ? i : 100 + i * 3) * 86_400_000).toISOString().slice(0, 10), reviewId: `R${pk.slice(-2)}${i}X` },
  ));
  return { prod, make };
}

test('aggregation ranks flaws, estimates buyer share from the histogram and detects rising trends', async () => {
  const { prod, make } = dataset();
  const p = prod('amazon.com:B0TEST0001', 'A');
  const reviews = make(p.key, 40, 'The lid leaks everywhere.', 2, true);
  const { results } = await analyzeReviews(reviews, { ai: null, store: openStore(null, { memory: true }), settings: {} });
  const agg = aggregateProduct(p, reviews, results);
  const leak = agg.flaws[0];
  assert.equal(leak.key, 'leaks');
  assert.equal(leak.mentions, 20);
  assert.equal(leak.shareOfNegative, 1);
  // all 1-star reviews mention it (10% of buyers), no 5-star does; 2-4 stars not sampled -> lower bound
  assert.ok(Math.abs(leak.estBuyerShare - 0.10) < 1e-9);
  assert.equal(leak.estLowerBound, true);
  assert.equal(leak.trend, 'rising');
  assert.ok(leak.impact >= 80, `impact ${leak.impact}`);
  assert.equal(leak.quotes.length, 3);
  assert.ok(leak.quotes[0].helpful >= leak.quotes[2].helpful);
});

test('market view: matrix, market-wide pains, own gaps, brief with AI and template fallback', async () => {
  const { prod, make } = dataset();
  const store = openStore(null, { memory: true });
  const ps = [prod('amazon.com:B0TEST0001', 'A'), prod('amazon.com:B0TEST0002', 'B'), prod('amazon.com:B0TEST0003', 'Mine', true)];
  const sets = [make(ps[0].key, 30, 'The lid leaks.', 2), make(ps[1].key, 30, 'It leaked and the handle snapped.', 3), make(ps[2].key, 30, 'Paint chipped after a week.', 3)];
  const aggs = [];
  for (const [i, p] of ps.entries()) {
    const { results } = await analyzeReviews(sets[i], { ai: null, store, settings: {} });
    aggs.push(aggregateProduct(p, sets[i], results));
  }
  const m = aggregateMarket(aggs);
  assert.equal(m.opportunities[0].key, 'leaks');
  assert.equal(m.opportunities[0].competitorsAffected, 2);
  assert.ok(m.marketWide.some((x) => x.key === 'leaks'));
  assert.ok(m.ownGaps.some((x) => x.key === 'finish-defects'));
  assert.ok(m.ownAdvantages.some((x) => x.key === 'leaks'));

  const t = templateBrief(briefInput(aggs, m));
  assert.equal(t.opportunities[0].key, 'leaks');
  assert.match(t.opportunities[0].listingClaim, /leak-proof/);

  const ai = fakeAi((model, req) => {
    const data = JSON.parse(req.messages[0].content.match(/DATA:\n([\s\S]*?)\n\nReturn JSON/)[1]);
    return JSON.stringify({ headline: 'Win on leaks', positioning: 'The bottle that never leaks.', opportunities: [...data.flaws.map((f) => ({ key: f.key, title: f.label, productFix: 'fix', listingClaim: 'claim', adHook: 'hook', supplierQuestion: 'q', priority: 'P1' })), { key: 'invented-key', title: 'x' }], listingBullets: ['b1'], mustKeep: ['k'], quickWins: ['w'], risks: ['r'] });
  });
  const b = await writeBrief(aggs, m, { ai });
  assert.equal(b.by, 'ai:fake:model-a');
  assert.equal(b.headline, 'Win on leaks');
  assert.ok(b.opportunities.every((o) => o.key !== 'invented-key'));
  const fallback = await writeBrief(aggs, m, { ai: fakeAi(() => 'garbage') });
  assert.equal(fallback.by, 'template');
});
