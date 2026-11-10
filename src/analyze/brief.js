// Opportunity brief: what to build, claim and advertise against the competitors' biggest flaws.
// Evidence numbers are computed in code; the AI only writes the recommendations (template fallback).
import { CATEGORY_BY_KEY, ISSUE_INDEX } from './taxonomy.js';
import { pct, truncate } from '../util.js';

export const BRIEF_VERSION = 'b1';

const SYSTEM = `You are a senior Amazon brand strategist and product developer. You get measured review data about competitor products in one niche. Write a sharp, practical opportunity brief for a brand that wants to beat them.
Rules:
- Base every recommendation on the flaws and praises given. Do not invent statistics, certifications or test results; write placeholders like [X hours] where a real number is needed.
- productFix: a concrete engineering / sourcing change. listingClaim: a short, Amazon-compliant benefit claim (no competitor names, no "best", no guarantees you cannot prove). adHook: a punchy ad / image headline (max 10 words). supplierQuestion: what to ask the factory before ordering.
- priority: P1 (do before launch), P2 (next batch), P3 (nice to have).
- Answer in English with JSON only.`;

function evidence(o, market, aggs) {
  const parts = aggs.filter((p) => !p.own).map((p) => {
    const f = p.flaws.find((x) => x.key === o.key);
    return f ? `${p.label}: ${f.mentions} reviews (${pct(f.shareOfNegative ?? f.share)} of ${f.shareOfNegative !== null ? 'negative' : 'collected'} reviews)` : null;
  }).filter(Boolean);
  return parts.join('; ');
}

export function briefInput(aggs, market, { niche } = {}) {
  return {
    niche: niche || null,
    products: aggs.map((p) => ({ label: p.label, own: p.own, rating: p.rating, ratings: p.ratingsCount, reviewsAnalysed: p.collected, amazonSummary: truncate(p.summary || '', 300) || undefined })),
    flaws: market.opportunities.slice(0, 10).map((o) => ({
      key: o.key, label: o.label, category: o.category, opportunity: o.opportunity, competitorsAffected: o.competitorsAffected,
      evidence: evidence(o, market, aggs),
      quotes: aggs.flatMap((p) => p.flaws.find((f) => f.key === o.key)?.quotes.slice(0, 2).map((q) => truncate(q.text, 160)) || []).slice(0, 3),
    })),
    praisesCustomersExpect: topPraises(aggs).map((p) => `${p.label} (${p.mentions} mentions)`),
    yourGaps: market.ownGaps.map((g) => g.label),
  };
}

function topPraises(aggs) {
  const m = new Map();
  for (const p of aggs.filter((x) => !x.own)) for (const pr of p.praises) {
    const c = m.get(pr.key) || { key: pr.key, label: pr.label, mentions: 0 };
    c.mentions += pr.mentions;
    m.set(pr.key, c);
  }
  return [...m.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 6);
}

function parseBrief(text, input) {
  const j = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  const known = new Map(input.flaws.map((f) => [f.key, f]));
  const opps = (Array.isArray(j.opportunities) ? j.opportunities : []).filter((o) => known.has(o?.key)).map((o) => ({
    key: o.key,
    title: truncate(String(o.title || known.get(o.key).label), 90),
    productFix: truncate(String(o.productFix || ''), 400),
    listingClaim: truncate(String(o.listingClaim || ''), 200),
    adHook: truncate(String(o.adHook || ''), 90),
    supplierQuestion: truncate(String(o.supplierQuestion || ''), 250),
    priority: /^P[123]$/.test(o.priority) ? o.priority : 'P2',
  }));
  if (input.flaws.length && opps.length < Math.min(3, input.flaws.length)) throw new Error('brief covers too few flaws');
  const list = (v, n, len = 220) => (Array.isArray(v) ? v : []).map((x) => truncate(String(x), len)).filter(Boolean).slice(0, n);
  return {
    headline: truncate(String(j.headline || ''), 160),
    positioning: truncate(String(j.positioning || ''), 500),
    opportunities: opps,
    listingBullets: list(j.listingBullets, 5, 260),
    mustKeep: list(j.mustKeep, 6),
    quickWins: list(j.quickWins, 6),
    risks: list(j.risks, 5),
  };
}

const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => `[${k}]`);

export function templateBrief(input) {
  const opps = input.flaws.map((f, i) => {
    const c = CATEGORY_BY_KEY[f.category];
    const issue = ISSUE_INDEX.get(f.key);
    return {
      key: f.key,
      title: `Fix "${f.label}"`,
      productFix: issue?.fix || c?.fix || 'Investigate the root cause with the factory and fix it in the next batch.',
      listingClaim: fill(issue?.claim || c?.claim || `No more "${f.label.toLowerCase()}".`),
      adHook: `Finally: no more ${f.label.toLowerCase()}.`,
      supplierQuestion: `What causes "${f.label.toLowerCase()}" and what test proves the new batch is fixed?`,
      priority: i < 3 || f.category === 'safety' ? 'P1' : i < 6 ? 'P2' : 'P3',
    };
  });
  const top = input.flaws.slice(0, 3).map((f) => f.label.toLowerCase());
  return {
    headline: top.length ? `Competitors lose buyers on: ${top.join(', ')}.` : 'Not enough negative reviews to rank flaws yet.',
    positioning: top.length ? `Position as the option that solves ${top.slice(0, 2).join(' and ')}, while matching what buyers already like (${input.praisesCustomersExpect.slice(0, 2).join(', ') || 'core function'}).` : '',
    opportunities: opps,
    listingBullets: opps.slice(0, 5).map((o) => o.listingClaim),
    mustKeep: input.praisesCustomersExpect.slice(0, 5),
    quickWins: ['Answer the top negative themes in the listing images and A+ content.', 'Add an FAQ / Q&A entry for each top flaw.', 'Insert card: how to get a fast replacement before leaving a review.'],
    risks: ['Fixes must be verified with samples before claiming them in the listing.'],
    by: 'template',
  };
}

export async function writeBrief(aggs, market, { ai, niche, log = () => {} } = {}) {
  const input = briefInput(aggs, market, { niche });
  if (!input.flaws.length) return { ...templateBrief(input), input };
  if (ai) {
    try {
      const res = await ai.generate({
        system: SYSTEM,
        messages: [{ role: 'user', content: `DATA:\n${JSON.stringify(input, null, 1)}\n\nReturn JSON: {"headline":"","positioning":"","opportunities":[{"key":"<flaw key from DATA>","title":"","productFix":"","listingClaim":"","adHook":"","supplierQuestion":"","priority":"P1"}],"listingBullets":["5 Amazon bullet points"],"mustKeep":["features to keep / match"],"quickWins":["actions this week"],"risks":[""]}. One opportunity per flaw in DATA, same order.` }],
        json: true,
        temperature: 0.4,
        maxTokens: 4096,
        totalBudgetMs: 90_000,
        timeoutMs: 45_000,
        parse: (t) => parseBrief(t, input),
      });
      return { ...res.data, by: `ai:${res.target}`, input };
    } catch (err) {
      log(`  [ai] brief failed on every model (${err.message}) -> template brief`);
    }
  }
  return { ...templateBrief(input), input };
}
