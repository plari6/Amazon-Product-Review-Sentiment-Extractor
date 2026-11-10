// Turns per-review analyses into ranked flaw clusters per product and a cross-competitor view.
import { CATEGORY_BY_KEY, ISSUE_INDEX, PRAISE_INDEX } from './taxonomy.js';
import { clamp, round } from '../util.js';

const DAY = 86_400_000;
const RECENT_DAYS = 90;

function mostCommon(list) {
  const c = new Map();
  for (const x of list) if (x) c.set(x, (c.get(x) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Estimated share of ALL raters affected: mention rate per star level, weighted by the product's
 * star histogram. Corrects the bias of collecting mostly critical reviews. Lower bound when some
 * star levels were not sampled.
 */
function stratified(mentionsByStar, collectedByStar, histogram) {
  if (!histogram) return { value: null, lowerBound: false };
  let est = 0;
  let missing = false;
  for (let s = 1; s <= 5; s++) {
    const w = (histogram[s] || 0) / 100;
    if (!w) continue;
    if (!collectedByStar[s]) { missing = true; continue; }
    est += w * ((mentionsByStar[s] || 0) / collectedByStar[s]);
  }
  return { value: est, lowerBound: missing };
}

function cluster(kind, entries, ctx) {
  // entries: [{ item (flaw|praise), review }]
  const byStar = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let helpful = 0, verified = 0, recent = 0, older = 0, sev = 0, ratingSum = 0, rated = 0, negatives = 0;
  for (const { item, review } of entries) {
    if (review.rating) { byStar[review.rating]++; ratingSum += review.rating; rated++; }
    if (review.rating && review.rating <= 2) negatives++;
    helpful += review.helpful || 0;
    if (review.verified) verified++;
    if (review.date && ctx.refTime) (ctx.refTime - Date.parse(review.date) <= RECENT_DAYS * DAY ? recent++ : older++);
    sev += item.severity || 0;
  }
  const key = entries[0].item.key;
  const known = kind === 'flaw' ? ISSUE_INDEX.get(key) : PRAISE_INDEX.get(key);
  const mentions = entries.length;
  const est = stratified(byStar, ctx.collectedByStar, ctx.histogram);

  let trend = null;
  if (ctx.recentCount >= 5 && ctx.olderCount >= 5) {
    const r = recent / ctx.recentCount;
    const o = older / ctx.olderCount;
    trend = r > o * 1.3 && r - o > 0.03 ? 'rising' : r < o * 0.7 && o - r > 0.03 ? 'falling' : 'stable';
  }

  const quotes = entries
    .slice()
    .sort((a, b) => (b.review.helpful || 0) - (a.review.helpful || 0) || (b.item.severity || 0) - (a.item.severity || 0) || (a.review.rating || 5) - (b.review.rating || 5))
    .slice(0, 3)
    .map(({ item, review }) => ({ text: item.quote || review.title || (review.body || '').slice(0, 160), rating: review.rating, date: review.date, helpful: review.helpful || 0, url: review.url, verified: review.verified }));

  const out = {
    key,
    label: known?.label || mostCommon(entries.map((e) => e.item.label)) || key,
    category: known?.category || mostCommon(entries.map((e) => e.item.category)) || 'other',
    mentions,
    share: ctx.total ? mentions / ctx.total : 0,
    shareOfNegative: ctx.negativeTotal ? negatives / ctx.negativeTotal : null,
    estBuyerShare: est.value,
    estLowerBound: est.lowerBound,
    avgRating: rated ? ratingSum / rated : null,
    helpfulVotes: helpful,
    verifiedShare: mentions ? verified / mentions : 0,
    trend,
    quotes,
    reviewIds: entries.map((e) => e.review.id),
  };
  if (kind === 'flaw') {
    out.avgSeverity = mentions ? sev / mentions : 0;
    out.impact = impactScore(out, ctx);
  }
  return out;
}

/** 0-100: how much this flaw hurts the product (reach among unhappy buyers, buyer share, severity, credibility, momentum). */
export function impactScore(c, ctx) {
  const negReach = c.shareOfNegative ?? c.share;
  const reach = clamp(negReach / 0.4, 0, 1) * 40;
  const popularity = c.estBuyerShare !== null ? clamp(c.estBuyerShare / 0.08, 0, 1) * 15 : clamp(c.share / 0.2, 0, 1) * 15;
  const severity = clamp((c.avgSeverity - 1) / 4, 0, 1) * 25;
  const credibility = clamp(Math.log10(1 + c.helpfulVotes) / 2, 0, 1) * 5 + c.verifiedShare * 5;
  const momentum = c.trend === 'rising' ? 10 : c.trend === 'falling' ? 0 : 5;
  let score = reach + popularity + severity + credibility + momentum;
  if (c.mentions < 3) score *= c.mentions === 1 ? 0.45 : 0.7; // small samples
  if (ctx.total < 20) score *= 0.85;
  return Math.round(clamp(score, 0, 100));
}

export function aggregateProduct(product, reviews, analyses) {
  const rows = reviews.map((r) => ({ review: r, a: analyses.get(r.id) })).filter((x) => x.a);
  const collectedByStar = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const { review } of rows) if (review.rating) collectedByStar[review.rating]++;
  const times = rows.map((x) => Date.parse(x.review.date)).filter(Number.isFinite);
  const refTime = times.length ? Math.max(...times) : null;
  const ctx = {
    total: rows.length,
    negativeTotal: rows.filter((x) => x.review.rating && x.review.rating <= 2).length,
    collectedByStar,
    histogram: product.histogram || null,
    refTime,
    recentCount: refTime ? times.filter((t) => refTime - t <= RECENT_DAYS * DAY).length : 0,
    olderCount: refTime ? times.filter((t) => refTime - t > RECENT_DAYS * DAY).length : 0,
  };

  const flawGroups = new Map();
  const praiseGroups = new Map();
  const sentiment = { negative: 0, neutral: 0, positive: 0, mixed: 0 };
  let scoreSum = 0, returnRisk = 0, byAi = 0;
  for (const { review, a } of rows) {
    sentiment[a.sentiment] = (sentiment[a.sentiment] || 0) + 1;
    scoreSum += a.score || 0;
    if (a.returnRisk) returnRisk++;
    if (String(a.by).startsWith('ai:')) byAi++;
    for (const f of a.flaws || []) { if (!flawGroups.has(f.key)) flawGroups.set(f.key, []); flawGroups.get(f.key).push({ item: f, review }); }
    for (const p of a.praises || []) { if (!praiseGroups.has(p.key)) praiseGroups.set(p.key, []); praiseGroups.get(p.key).push({ item: p, review }); }
  }

  const flaws = [...flawGroups.values()].map((e) => cluster('flaw', e, ctx)).sort((a, b) => b.impact - a.impact || b.mentions - a.mentions);
  const praises = [...praiseGroups.values()].map((e) => cluster('praise', e, ctx)).sort((a, b) => b.mentions - a.mentions);

  const catMap = new Map();
  for (const f of flaws) {
    const c = catMap.get(f.category) || { category: f.category, label: CATEGORY_BY_KEY[f.category]?.label || 'Other', mentions: 0, reviewIds: new Set(), topImpact: 0, issues: [] };
    c.mentions += f.mentions;
    f.reviewIds.forEach((id) => c.reviewIds.add(id));
    c.topImpact = Math.max(c.topImpact, f.impact);
    c.issues.push(f.key);
    catMap.set(f.category, c);
  }
  const categories = [...catMap.values()]
    .map((c) => ({ category: c.category, label: c.label, mentions: c.mentions, reviews: c.reviewIds.size, share: ctx.total ? c.reviewIds.size / ctx.total : 0, topImpact: c.topImpact, issues: c.issues }))
    .sort((a, b) => b.reviews - a.reviews);

  const insights = (product.insights || []).slice().sort((a, b) => (b.negative ?? 0) - (a.negative ?? 0));
  return {
    key: product.key,
    label: product.label,
    own: Boolean(product.own),
    asin: product.asin,
    url: product.url,
    title: product.title,
    brand: product.brand,
    price: product.price,
    rating: product.rating,
    ratingsCount: product.ratingsCount,
    histogram: product.histogram,
    summary: product.summary,
    insights,
    collected: rows.length,
    collectedByStar,
    analysedByAi: byAi,
    sentiment,
    avgScore: rows.length ? round(scoreSum / rows.length, 2) : null,
    avgCollectedRating: rows.filter((x) => x.review.rating).length ? round(rows.reduce((s, x) => s + (x.review.rating || 0), 0) / rows.filter((x) => x.review.rating).length, 2) : null,
    returnRiskShare: rows.length ? returnRisk / rows.length : 0,
    negativeShare: rows.length ? (sentiment.negative + sentiment.mixed * 0.5) / rows.length : 0,
    flaws,
    praises,
    categories,
    period: times.length ? { from: new Date(Math.min(...times)).toISOString().slice(0, 10), to: new Date(refTime).toISOString().slice(0, 10) } : null,
  };
}

/** Cross-product view: flaw matrix, market-wide pains, your gaps and advantages. */
export function aggregateMarket(productAggs) {
  const competitors = productAggs.filter((p) => !p.own);
  const own = productAggs.find((p) => p.own) || null;
  const keys = new Map();
  for (const p of productAggs) for (const f of p.flaws) {
    const k = keys.get(f.key) || { key: f.key, label: f.label, category: f.category, totalImpact: 0, products: {} };
    k.totalImpact += f.impact;
    k.products[p.key] = { impact: f.impact, share: f.share, shareOfNegative: f.shareOfNegative, estBuyerShare: f.estBuyerShare, mentions: f.mentions };
    keys.set(f.key, k);
  }
  const rows = [...keys.values()].map((k) => {
    const comp = competitors.map((p) => k.products[p.key]).filter(Boolean);
    const affected = comp.filter((x) => x.mentions >= 2 || x.impact >= 35).length;
    const avgImpact = comp.length ? comp.reduce((s, x) => s + x.impact, 0) / competitors.length : 0;
    const maxImpact = comp.reduce((m, x) => Math.max(m, x.impact), 0);
    const breadth = competitors.length ? affected / competitors.length : 0;
    return {
      ...k,
      competitorsAffected: affected,
      avgCompetitorImpact: Math.round(avgImpact),
      avgCompetitorShare: competitors.length ? comp.reduce((s, x) => s + x.share, 0) / competitors.length : 0,
      // Market opportunity: the worst damage to one competitor (a conquest angle), the average damage,
      // and how many competitors share the pain (a category-wide angle).
      opportunity: Math.round((0.6 * maxImpact + 0.4 * avgImpact) * (0.75 + 0.25 * breadth)),
      own: own ? k.products[own.key] || null : null,
    };
  }).sort((a, b) => b.opportunity - a.opportunity || b.totalImpact - a.totalImpact);

  const marketWide = rows.filter((r) => competitors.length >= 2 && r.competitorsAffected >= 2);
  const ownGaps = own ? rows.filter((r) => r.own && r.own.share > r.avgCompetitorShare * 1.2 && r.own.mentions >= 2).sort((a, b) => b.own.impact - a.own.impact) : [];
  const ownAdvantages = own ? rows.filter((r) => r.competitorsAffected >= 1 && (!r.own || r.own.share < r.avgCompetitorShare * 0.5)).slice(0, 8) : [];

  return {
    products: productAggs.map((p) => ({ key: p.key, label: p.label, own: p.own })),
    matrix: rows.slice(0, 25),
    opportunities: rows.filter((r) => r.opportunity > 0).slice(0, 12),
    marketWide,
    ownGaps,
    ownAdvantages,
    totals: {
      products: productAggs.length,
      reviews: productAggs.reduce((s, p) => s + p.collected, 0),
      analysedByAi: productAggs.reduce((s, p) => s + p.analysedByAi, 0),
    },
  };
}
