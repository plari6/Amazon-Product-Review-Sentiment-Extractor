// analyse every stored product -> aggregate -> market view -> opportunity brief.
import { aggregateMarket, aggregateProduct } from './analyze/aggregate.js';
import { writeBrief } from './analyze/brief.js';
import { analyzeReviews } from './analyze/classifier.js';

export async function runAnalysis({ store, settings, ai = null, products, log = () => {}, force = false, niche, brief = true }) {
  const list = (products?.length ? products.map((k) => store.findProduct(k) || store.product(k)).filter(Boolean) : store.products());
  if (!list.length) throw new Error('No products in this project yet. Run `scrape`, `import` or `demo` first.');
  const aggs = [];
  const totals = { cached: 0, ai: 0, rules: 0, failedBatches: 0, models: {} };
  for (const p of list) {
    const reviews = store.reviews(p.key);
    log(`Analysing ${p.label}: ${reviews.length} reviews`);
    const { results, stats } = await analyzeReviews(reviews, { ai, store, settings, product: p, log, force });
    for (const k of ['cached', 'ai', 'rules', 'failedBatches']) totals[k] += stats[k];
    for (const [m, n] of Object.entries(stats.models)) totals.models[m] = (totals.models[m] || 0) + n;
    aggs.push(aggregateProduct(p, reviews, results));
    store.save(); // keep the analysis cache even if a later product fails
  }
  const market = aggregateMarket(aggs);
  const b = brief ? await writeBrief(aggs, market, { ai, niche: niche || store.data.niche, log }) : null;
  store.addRun({ at: new Date().toISOString(), products: aggs.length, reviews: market.totals.reviews, stats: totals, brief: b?.by || null });
  store.save();
  return { aggs, market, brief: b, stats: totals, generatedAt: new Date().toISOString(), project: settings.project, niche: niche || store.data.niche || null };
}
