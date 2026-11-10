// Writes the analysis as Excel, HTML dashboard, Markdown brief, CSV and JSON.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { CATEGORY_BY_KEY } from '../analyze/taxonomy.js';
import { pct, round, slug, toCsv, truncate } from '../util.js';
import { renderHtml } from './html.js';
import { PROMPT_VERSION } from '../analyze/classifier.js';
import { analysisHash } from '../normalize.js';

export const ALL_FORMATS = ['xlsx', 'html', 'md', 'csv', 'json'];
const catLabel = (k) => CATEGORY_BY_KEY[k]?.label || 'Other';
const trendLabel = (t) => (t === 'rising' ? '▲ rising' : t === 'falling' ? '▼ falling' : t === 'stable' ? '● stable' : '');
const est = (f) => (f.estBuyerShare === null ? '' : `${f.estLowerBound ? '≥' : ''}${pct(f.estBuyerShare, 1)}`);

export function reviewRows(result, store) {
  const rows = [];
  for (const p of result.aggs) {
    for (const r of store.reviews(p.key)) {
      const a = store.getAnalysis(analysisHash(r, PROMPT_VERSION));
      rows.push({
        Product: p.label, Date: r.date || '', Stars: r.rating ?? '', Title: r.title || '', Review: r.body || '',
        Sentiment: a?.sentiment || '', Score: a?.score ?? '',
        Flaws: (a?.flaws || []).map((f) => f.label).join(' | '), Praise: (a?.praises || []).map((x) => x.label).join(' | '),
        'Return risk': a?.returnRisk ? 'yes' : '', Verified: r.verified ? 'yes' : '', Helpful: r.helpful || 0,
        Variant: r.variant || '', Country: r.country || '', 'Analysed by': a?.by || '', Link: r.url || '',
      });
    }
  }
  return rows;
}

export function flawRows(result) {
  return result.aggs.flatMap((p) => p.flaws.map((f) => ({
    Product: p.label, Flaw: f.label, Key: f.key, Category: catLabel(f.category), Impact: f.impact, Mentions: f.mentions,
    '% of negative reviews': f.shareOfNegative === null ? '' : round(f.shareOfNegative * 100, 1), '% of reviews': round(f.share * 100, 1),
    'Est. % of buyers': f.estBuyerShare === null ? '' : round(f.estBuyerShare * 100, 1), 'Avg severity': round(f.avgSeverity, 1),
    'Avg stars': round(f.avgRating, 1), Trend: f.trend || '', 'Helpful votes': f.helpfulVotes,
    'Top quote': f.quotes[0]?.text || '', Link: f.quotes[0]?.url || '',
  })));
}

export async function writeReports(result, { outDir, formats = ALL_FORMATS, store, name } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, slug(name || result.project || 'report') || 'report');
  const files = [];
  if (formats.includes('xlsx')) { await writeExcel(result, `${base}.xlsx`, store); files.push(`${base}.xlsx`); }
  if (formats.includes('html')) { fs.writeFileSync(`${base}.html`, renderHtml(result)); files.push(`${base}.html`); }
  if (formats.includes('md')) { fs.writeFileSync(`${base}.md`, renderMarkdown(result)); files.push(`${base}.md`); }
  if (formats.includes('csv')) {
    const rv = reviewRows(result, store);
    fs.writeFileSync(`${base}-reviews.csv`, toCsv(rv, rv.length ? undefined : ['Product']));
    const fl = flawRows(result);
    fs.writeFileSync(`${base}-flaws.csv`, toCsv(fl, fl.length ? undefined : ['Product']));
    files.push(`${base}-reviews.csv`, `${base}-flaws.csv`);
  }
  if (formats.includes('json')) {
    const slim = { ...result, aggs: result.aggs.map((p) => ({ ...p, flaws: p.flaws.map(({ reviewIds, ...f }) => f), praises: p.praises.map(({ reviewIds, ...f }) => f) })) };
    fs.writeFileSync(`${base}.json`, JSON.stringify(slim, null, 2));
    files.push(`${base}.json`);
  }
  return files;
}

async function writeExcel(result, file, store) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Amazon Review Sentiment Extractor';
  wb.created = new Date();
  const link = (url, text = 'Open') => (url ? { text, hyperlink: url } : '');
  const sheet = (name, columns, rows, { wrap = [] } = {}) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.h, key: c.h, width: c.w || 14 }));
    for (const r of rows) ws.addRow(r);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF232F3E' } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.link) col.eachCell((cell, n) => { if (n > 1 && cell.value) cell.font = { color: { argb: 'FF0563C1' }, underline: true }; });
      if (c.pct) col.numFmt = '0.0"%"';
      if (wrap.includes(c.h)) col.alignment = { wrapText: true, vertical: 'top' };
    });
    return ws;
  };

  const b = result.brief;
  sheet('Summary', [
    { h: 'Product', w: 34 }, { h: 'Own', w: 6 }, { h: 'ASIN', w: 12 }, { h: 'Rating', w: 8 }, { h: 'Ratings', w: 9 }, { h: 'Reviews analysed', w: 10 },
    { h: '% negative', w: 10, pct: true }, { h: 'Return risk', w: 10, pct: true }, { h: 'Flaw #1', w: 30 }, { h: 'Flaw #2', w: 30 }, { h: 'Flaw #3', w: 30 },
    { h: 'Amazon summary', w: 60 }, { h: 'Link', w: 10, link: true },
  ], result.aggs.map((p) => ({
    Product: p.label, Own: p.own ? 'yes' : '', ASIN: p.asin || '', Rating: p.rating ?? '', Ratings: p.ratingsCount ?? '', 'Reviews analysed': p.collected,
    '% negative': round(p.negativeShare * 100, 1), 'Return risk': round(p.returnRiskShare * 100, 1),
    'Flaw #1': p.flaws[0] ? `${p.flaws[0].label} (${p.flaws[0].impact})` : '', 'Flaw #2': p.flaws[1] ? `${p.flaws[1].label} (${p.flaws[1].impact})` : '', 'Flaw #3': p.flaws[2] ? `${p.flaws[2].label} (${p.flaws[2].impact})` : '',
    'Amazon summary': p.summary || '', Link: link(p.url, 'Product page'),
  })), { wrap: ['Amazon summary'] });

  const oppByKey = new Map((b?.opportunities || []).map((o) => [o.key, o]));
  sheet('Opportunities', [
    { h: 'Priority', w: 8 }, { h: 'Flaw', w: 30 }, { h: 'Category', w: 18 }, { h: 'Opportunity', w: 11 }, { h: 'Competitors affected', w: 11 },
    { h: 'Evidence', w: 50 }, { h: 'Product fix', w: 50 }, { h: 'Listing claim', w: 40 }, { h: 'Ad hook', w: 30 }, { h: 'Supplier question', w: 45 },
  ], result.market.opportunities.map((o) => {
    const x = oppByKey.get(o.key) || {};
    const ev = b?.input?.flaws.find((f) => f.key === o.key)?.evidence || '';
    return { Priority: x.priority || '', Flaw: o.label, Category: catLabel(o.category), Opportunity: o.opportunity, 'Competitors affected': o.competitorsAffected, Evidence: ev, 'Product fix': x.productFix || '', 'Listing claim': x.listingClaim || '', 'Ad hook': x.adHook || '', 'Supplier question': x.supplierQuestion || '' };
  }), { wrap: ['Evidence', 'Product fix', 'Listing claim', 'Supplier question'] });

  sheet('Flaws', [
    { h: 'Product', w: 30 }, { h: 'Flaw', w: 30 }, { h: 'Key', w: 22 }, { h: 'Category', w: 18 }, { h: 'Impact', w: 8 }, { h: 'Mentions', w: 9 },
    { h: '% of negative reviews', w: 11, pct: true }, { h: '% of reviews', w: 10, pct: true }, { h: 'Est. % of buyers', w: 10, pct: true },
    { h: 'Avg severity', w: 9 }, { h: 'Avg stars', w: 8 }, { h: 'Trend', w: 9 }, { h: 'Helpful votes', w: 9 }, { h: 'Top quote', w: 60 }, { h: 'Link', w: 10, link: true },
  ], flawRows(result).map((r) => ({ ...r, Link: link(r.Link) })), { wrap: ['Top quote'] });

  const prods = result.aggs;
  const ws = sheet('Matrix', [{ h: 'Flaw', w: 32 }, { h: 'Category', w: 18 }, { h: 'Opportunity', w: 11 }, ...prods.map((p) => ({ h: truncate(p.label, 30) + (p.own ? ' (you)' : ''), w: 16 }))],
    result.market.matrix.map((m) => ({ Flaw: m.label, Category: catLabel(m.category), Opportunity: m.opportunity, ...Object.fromEntries(prods.map((p) => [truncate(p.label, 30) + (p.own ? ' (you)' : ''), m.products[p.key]?.impact ?? ''])) })));
  ws.eachRow((row, n) => {
    if (n === 1) return;
    for (let c = 4; c < 4 + prods.length; c++) {
      const v = row.getCell(c).value;
      if (typeof v === 'number') row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v >= 60 ? 'FFF4B6B6' : v >= 35 ? 'FFFBE3B5' : 'FFE8F3E8' } };
    }
  });

  sheet('Praise', [{ h: 'Product', w: 30 }, { h: 'Strength', w: 30 }, { h: 'Mentions', w: 9 }, { h: '% of reviews', w: 10, pct: true }, { h: 'Quote', w: 70 }, { h: 'Link', w: 10, link: true }],
    prods.flatMap((p) => p.praises.map((x) => ({ Product: p.label, Strength: x.label, Mentions: x.mentions, '% of reviews': round(x.share * 100, 1), Quote: x.quotes[0]?.text || '', Link: link(x.quotes[0]?.url) }))), { wrap: ['Quote'] });

  sheet('Amazon aspects', [{ h: 'Product', w: 30 }, { h: 'Aspect', w: 24 }, { h: 'Mentions', w: 9 }, { h: 'Positive', w: 9 }, { h: 'Negative', w: 9 }, { h: '% negative', w: 10, pct: true }, { h: 'Quote', w: 70 }, { h: 'Link', w: 10, link: true }],
    prods.flatMap((p) => (p.insights || []).map((a) => ({ Product: p.label, Aspect: a.aspect, Mentions: a.mentions, Positive: a.positive ?? '', Negative: a.negative ?? '', '% negative': a.negativeShare === undefined ? '' : round(a.negativeShare * 100, 1), Quote: a.quotes?.[0]?.text || '', Link: link(a.quotes?.[0]?.reviewId && p.asin ? `https://www.${p.key.split(':')[0]}/gp/customer-reviews/${a.quotes[0].reviewId}` : null) }))), { wrap: ['Quote'] });

  sheet('Reviews', [
    { h: 'Product', w: 26 }, { h: 'Date', w: 11 }, { h: 'Stars', w: 6 }, { h: 'Title', w: 30 }, { h: 'Review', w: 70 }, { h: 'Sentiment', w: 10 }, { h: 'Score', w: 7 },
    { h: 'Flaws', w: 36 }, { h: 'Praise', w: 30 }, { h: 'Return risk', w: 8 }, { h: 'Verified', w: 8 }, { h: 'Helpful', w: 8 }, { h: 'Variant', w: 18 }, { h: 'Country', w: 12 }, { h: 'Analysed by', w: 22 }, { h: 'Link', w: 10, link: true },
  ], reviewRows(result, store).map((r) => ({ ...r, Review: truncate(r.Review, 3000), Link: link(r.Link) })), { wrap: ['Review'] });

  await wb.xlsx.writeFile(file);
}

export function renderMarkdown(result) {
  const { aggs, market, brief: b } = result;
  const L = [];
  L.push(`# Competitor review analysis${result.niche ? ` – ${result.niche}` : ''}`, '');
  L.push(`${market.totals.reviews} reviews of ${aggs.length} products analysed (${market.totals.analysedByAi} by AI, rest by keyword rules) · ${result.generatedAt.slice(0, 10)}`, '');
  if (b) {
    L.push(`## ${b.headline || 'Summary'}`, '', b.positioning || '', '');
    if (b.opportunities?.length) {
      L.push('## Opportunities', '', '| Priority | Flaw | Opportunity | Product fix | Listing claim | Ad hook |', '|---|---|---|---|---|---|');
      for (const o of b.opportunities) {
        const m = market.opportunities.find((x) => x.key === o.key);
        L.push(`| ${o.priority} | **${o.title}** | ${m?.opportunity ?? ''} | ${o.productFix.replace(/\|/g, '/')} | ${o.listingClaim.replace(/\|/g, '/')} | ${o.adHook.replace(/\|/g, '/')} |`);
      }
      L.push('');
    }
    if (b.listingBullets?.length) L.push('### Listing bullets to test', '', ...b.listingBullets.map((x) => `- ${x}`), '');
    if (b.mustKeep?.length) L.push('### What buyers already expect (match it)', '', ...b.mustKeep.map((x) => `- ${x}`), '');
    if (b.quickWins?.length) L.push('### Quick wins', '', ...b.quickWins.map((x) => `- ${x}`), '');
  }
  if (market.marketWide.length) L.push('## Pains no competitor solves', '', ...market.marketWide.slice(0, 8).map((m) => `- **${m.label}** – hurts ${m.competitorsAffected} competitors (opportunity ${m.opportunity})`), '');
  if (market.ownGaps.length) L.push('## Where your product is weaker', '', ...market.ownGaps.map((g) => `- **${g.label}** – ${pct(g.own.share, 1)} of your reviews vs ${pct(g.avgCompetitorShare, 1)} for competitors`), '');
  for (const p of aggs) {
    L.push(`## ${p.label}${p.own ? ' (your product)' : ''}`, '');
    L.push(`${p.rating ? `${p.rating}★ from ${p.ratingsCount ?? '?'} ratings · ` : ''}${p.collected} reviews analysed · ${pct(p.negativeShare)} negative · ${pct(p.returnRiskShare)} mention returns/refunds${p.url ? ` · [Amazon page](${p.url})` : ''}`, '');
    if (p.summary) L.push(`> Amazon "Customers say": ${p.summary}`, '');
    if (p.flaws.length) {
      L.push('| Impact | Flaw | Mentions | % of negative | Est. % of buyers | Trend | Quote |', '|---|---|---|---|---|---|---|');
      for (const f of p.flaws.slice(0, 8)) {
        const q = f.quotes[0];
        L.push(`| ${f.impact} | ${f.label} | ${f.mentions} | ${f.shareOfNegative === null ? '–' : pct(f.shareOfNegative)} | ${est(f) || '–'} | ${trendLabel(f.trend)} | ${q ? `${q.url ? `[“${truncate(q.text, 90).replace(/\|/g, '/')}”](${q.url})` : `“${truncate(q.text, 90).replace(/\|/g, '/')}”`} (${q.rating ?? '?'}★)` : ''} |`);
      }
      L.push('');
    }
    if (p.praises.length) L.push(`Buyers like: ${p.praises.slice(0, 5).map((x) => `${x.label} (${x.mentions})`).join(', ')}`, '');
    const negAspects = (p.insights || []).filter((a) => a.negative > 0).slice(0, 5);
    if (negAspects.length) L.push(`Amazon aspect counts (all reviews): ${negAspects.map((a) => `${a.aspect} ${a.negative}/${a.mentions} negative`).join(', ')}`, '');
  }
  return L.join('\n');
}
