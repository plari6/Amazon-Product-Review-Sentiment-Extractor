// Self-contained HTML dashboard (no external assets), light + dark mode, works on a phone.
import { CATEGORY_BY_KEY } from '../analyze/taxonomy.js';
import { pct, truncate } from '../util.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cat = (k) => CATEGORY_BY_KEY[k]?.label || 'Other';
const heat = (v) => (v === undefined || v === null ? '' : v >= 60 ? 'h3' : v >= 35 ? 'h2' : 'h1');
const trend = (t) => (t === 'rising' ? '<span class="tr up" title="Mentioned more in the last 90 days">▲ rising</span>' : t === 'falling' ? '<span class="tr down" title="Mentioned less in the last 90 days">▼ falling</span>' : '');

function quote(q) {
  if (!q) return '';
  const t = `“${esc(truncate(q.text, 180))}”`;
  return `<blockquote>${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener">${t}</a>` : t}<cite>${q.rating ? `${q.rating}★` : ''}${q.date ? ` · ${esc(q.date)}` : ''}${q.helpful ? ` · ${q.helpful} found helpful` : ''}${q.verified ? ' · verified' : ''}</cite></blockquote>`;
}

function histogram(h) {
  if (!h) return '';
  return `<div class="hist">${[5, 4, 3, 2, 1].map((s) => `<div class="hrow"><span>${s}★</span><i><b style="width:${h[s] || 0}%"></b></i><span>${h[s] || 0}%</span></div>`).join('')}</div>`;
}

function sentimentBar(p) {
  const n = p.collected || 1;
  const seg = (k, cls) => (p.sentiment[k] ? `<b class="${cls}" style="width:${(p.sentiment[k] / n) * 100}%" title="${k}: ${p.sentiment[k]}"></b>` : '');
  return `<div class="sbar">${seg('negative', 'neg')}${seg('mixed', 'mix')}${seg('neutral', 'neu')}${seg('positive', 'pos')}</div>
  <div class="legend"><span><i class="neg"></i>negative ${p.sentiment.negative}</span><span><i class="mix"></i>mixed ${p.sentiment.mixed}</span><span><i class="neu"></i>neutral ${p.sentiment.neutral}</span><span><i class="pos"></i>positive ${p.sentiment.positive}</span></div>`;
}

function productCard(p) {
  const flaws = p.flaws.slice(0, 8).map((f) => `
    <details class="flaw"><summary>
      <span class="fl">${esc(f.label)} <small>${esc(cat(f.category))}</small></span>
      <span class="bar"><b class="${heat(f.impact)}" style="width:${f.impact}%"></b></span>
      <span class="num" title="Impact score 0-100">${f.impact}</span>
    </summary>
    <div class="fd">
      <p class="meta">${f.mentions} reviews · ${f.shareOfNegative === null ? '' : `${pct(f.shareOfNegative)} of 1–2★ reviews · `}${f.estBuyerShare === null ? '' : `est. ${f.estLowerBound ? '≥' : ''}${pct(f.estBuyerShare, 1)} of all buyers · `}severity ${f.avgSeverity.toFixed(1)}/5 ${trend(f.trend)}</p>
      ${f.quotes.map(quote).join('')}
    </div></details>`).join('');
  const aspects = (p.insights || []).slice(0, 8).map((a) => `<span class="chip ${a.negative > a.positive ? 'bad' : a.negative ? 'mid' : 'good'}" title="${a.mentions} mentions">${esc(a.aspect)} <small>${a.positive ?? '?'}+ / ${a.negative ?? '?'}−</small></span>`).join('');
  return `<section class="card product" id="${esc(p.key)}">
    <header><div><h3>${esc(p.label)}${p.own ? ' <span class="you">your product</span>' : ''}</h3>
      <p class="meta">${p.rating ? `<strong>${p.rating}★</strong> from ${p.ratingsCount ?? '?'} ratings · ` : ''}${p.collected} reviews analysed${p.period ? ` (${p.period.from} → ${p.period.to})` : ''}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">Amazon page</a>` : ''}</p></div>
      <div class="kpis"><div><b>${pct(p.negativeShare)}</b><span>negative</span></div><div><b>${pct(p.returnRiskShare)}</b><span>return / refund</span></div></div>
    </header>
    <div class="grid2">
      <div>${sentimentBar(p)}${p.summary ? `<p class="amz"><span>Amazon “Customers say”</span>${esc(p.summary)}</p>` : ''}</div>
      <div>${histogram(p.histogram)}</div>
    </div>
    <h4>Biggest flaws <small>impact 0–100 · click for proof</small></h4>
    ${flaws || '<p class="muted">No flaws found in the collected reviews.</p>'}
    ${p.praises.length ? `<h4>What buyers like</h4><div class="chips">${p.praises.slice(0, 8).map((x) => `<span class="chip good">${esc(x.label)} <small>${x.mentions}</small></span>`).join('')}</div>` : ''}
    ${aspects ? `<h4>Amazon aspect counts <small>across all reviews, from the product page</small></h4><div class="chips">${aspects}</div>` : ''}
  </section>`;
}

export function renderHtml(result) {
  const { aggs, market, brief: b } = result;
  const oppByKey = new Map((b?.opportunities || []).map((o) => [o.key, o]));
  const evidence = new Map((b?.input?.flaws || []).map((f) => [f.key, f.evidence]));
  const topOpp = market.opportunities[0];

  const opps = market.opportunities.slice(0, 9).map((o) => {
    const x = oppByKey.get(o.key) || {};
    return `<article class="opp">
      <div class="oh"><span class="pr ${esc(x.priority || 'P2')}">${esc(x.priority || '–')}</span><h3>${esc(x.title || o.label)}</h3><span class="score" title="Opportunity score">${o.opportunity}</span></div>
      <p class="meta">${esc(cat(o.category))} · hurts ${o.competitorsAffected} of ${aggs.filter((p) => !p.own).length} competitors</p>
      ${evidence.get(o.key) ? `<p class="ev">${esc(evidence.get(o.key))}</p>` : ''}
      ${x.productFix ? `<dl><dt>Product fix</dt><dd>${esc(x.productFix)}</dd><dt>Listing claim</dt><dd>${esc(x.listingClaim)}</dd><dt>Ad hook</dt><dd class="hook">${esc(x.adHook)}</dd><dt>Ask the supplier</dt><dd>${esc(x.supplierQuestion)}</dd></dl>` : ''}
    </article>`;
  }).join('');

  const matrix = market.matrix.length ? `<div class="tw"><table class="matrix"><thead><tr><th>Flaw</th><th>Opp.</th>${aggs.map((p) => `<th title="${esc(p.label)}">${esc(truncate(p.label, 22))}${p.own ? ' (you)' : ''}</th>`).join('')}</tr></thead><tbody>
    ${market.matrix.slice(0, 15).map((m) => `<tr><td>${esc(m.label)}<small>${esc(cat(m.category))}</small></td><td class="n">${m.opportunity}</td>${aggs.map((p) => { const c = m.products[p.key]; return `<td class="n ${heat(c?.impact)}" title="${c ? `${c.mentions} reviews, ${pct(c.share, 1)} of collected` : 'not mentioned'}">${c ? c.impact : '·'}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table></div>` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Competitor Review Insights</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16191d;--muted:#5d6672;--line:#e3e6ea;--accent:#c45500;--accent-soft:#fff1e6;--h1:#e6f2e8;--h2:#fbe7c2;--h3:#f6c3c0;--neg:#d14343;--mix:#e3a008;--neu:#9aa4b2;--pos:#2f9e5b;--link:#0b63c5}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1216;--card:#171b21;--ink:#e8ebef;--muted:#9aa3ae;--line:#2a3039;--accent:#ff9a3c;--accent-soft:#2b1f14;--h1:#1d3325;--h2:#3d3115;--h3:#4a1f1f;--link:#6cb2ff}}
:root[data-theme="dark"]{--bg:#0f1216;--card:#171b21;--ink:#e8ebef;--muted:#9aa3ae;--line:#2a3039;--accent:#ff9a3c;--accent-soft:#2b1f14;--h1:#1d3325;--h2:#3d3115;--h3:#4a1f1f;--link:#6cb2ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--link)}main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 12px}h3{font-size:16px;margin:0}h4{margin:20px 0 8px;font-size:14px}h4 small,small{color:var(--muted);font-weight:400}
.meta,.muted{color:var(--muted);font-size:13px;margin:4px 0}
.top{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-end}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:120px}.stat b{display:block;font-size:20px}.stat span{color:var(--muted);font-size:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin:14px 0}
.brief{border-left:4px solid var(--accent)}.brief h2{margin:0 0 6px}
.opps{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.opp{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.oh{display:flex;gap:8px;align-items:center}.oh h3{flex:1}.score{font-weight:700;font-size:18px;color:var(--accent)}
.pr{font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;background:var(--line)}.pr.P1{background:var(--accent);color:#fff}
.ev{font-size:13px;background:var(--accent-soft);border-radius:8px;padding:8px 10px}
dl{margin:8px 0 0;font-size:14px}dt{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-top:8px}dd{margin:2px 0 0}.hook{font-weight:600}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:600}
td small{display:block;color:var(--muted)}td.n{text-align:center;font-variant-numeric:tabular-nums}.h1{background:var(--h1)}.h2{background:var(--h2)}.h3{background:var(--h3)}
.product header{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.you{font-size:11px;background:var(--accent);color:#fff;padding:2px 7px;border-radius:6px;vertical-align:middle}
.kpis{display:flex;gap:16px}.kpis div{text-align:right}.kpis b{display:block;font-size:20px}.kpis span{font-size:12px;color:var(--muted)}
.grid2{display:grid;grid-template-columns:1.4fr 1fr;gap:20px;margin-top:12px}@media (max-width:720px){.grid2{grid-template-columns:1fr}}
.sbar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--line)}.sbar b{display:block}.neg{background:var(--neg)}.mix{background:var(--mix)}.neu{background:var(--neu)}.pos{background:var(--pos)}
.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:6px}.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px}
.amz{font-size:13px;margin-top:12px}.amz span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.hist .hrow{display:grid;grid-template-columns:28px 1fr 36px;gap:8px;align-items:center;font-size:12px;color:var(--muted)}.hist i{height:8px;background:var(--line);border-radius:4px;overflow:hidden}.hist b{display:block;height:100%;background:var(--mix)}
details.flaw{border-top:1px solid var(--line)}details.flaw summary{display:grid;grid-template-columns:minmax(0,1.3fr) 1fr 34px;gap:10px;align-items:center;padding:9px 0;cursor:pointer;list-style:none}
details.flaw summary::-webkit-details-marker{display:none}.fl small{display:block;color:var(--muted);font-size:12px}
.bar{height:10px;background:var(--line);border-radius:5px;overflow:hidden}.bar b{display:block;height:100%}.bar b.h1{background:var(--pos)}.bar b.h2{background:var(--mix)}.bar b.h3{background:var(--neg)}
.num{font-weight:700;text-align:right;font-variant-numeric:tabular-nums}.fd{padding:0 0 12px}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line);font-size:14px}blockquote a{color:inherit;text-decoration:none}blockquote a:hover{text-decoration:underline}cite{display:block;font-size:12px;color:var(--muted);font-style:normal}
.tr{font-size:12px;font-weight:600}.tr.up{color:var(--neg)}.tr.down{color:var(--pos)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:13px;padding:3px 9px;border-radius:999px;border:1px solid var(--line)}.chip.good{background:var(--h1)}.chip.mid{background:var(--h2)}.chip.bad{background:var(--h3)}
ul{padding-left:20px}footer{color:var(--muted);font-size:12px;margin-top:40px}
</style></head><body><main>
<div class="top"><div><h1>Competitor review insights${result.niche ? ` · ${esc(result.niche)}` : ''}</h1>
<p class="meta">Generated ${esc(result.generatedAt.slice(0, 16).replace('T', ' '))} · project “${esc(result.project)}”</p></div>
<div class="stats"><div class="stat"><b>${aggs.length}</b><span>products</span></div><div class="stat"><b>${market.totals.reviews}</b><span>reviews analysed</span></div><div class="stat"><b>${market.totals.reviews ? pct(market.totals.analysedByAi / market.totals.reviews) : '–'}</b><span>read by AI</span></div>${topOpp ? `<div class="stat"><b>${esc(truncate(topOpp.label, 22))}</b><span>#1 opportunity</span></div>` : ''}</div></div>

${b ? `<section class="card brief"><h2>${esc(b.headline)}</h2><p>${esc(b.positioning)}</p>
${b.listingBullets?.length ? `<h4>Listing bullets to test</h4><ul>${b.listingBullets.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${b.mustKeep?.length ? `<h4>What buyers already expect – match it</h4><ul>${b.mustKeep.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${b.quickWins?.length ? `<h4>Quick wins</h4><ul>${b.quickWins.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
<p class="meta">Brief written by ${esc(b.by || 'template')}</p></section>` : ''}

${opps ? `<h2>Opportunities <small>ranked by how much the flaw hurts competitors</small></h2><div class="opps">${opps}</div>` : ''}
${market.ownGaps.length ? `<h2>Where your product is weaker</h2><div class="card"><ul>${market.ownGaps.map((g) => `<li><b>${esc(g.label)}</b> – ${pct(g.own.share, 1)} of your reviews vs ${pct(g.avgCompetitorShare, 1)} for competitors</li>`).join('')}</ul></div>` : ''}
${matrix ? `<h2>Flaw matrix <small>impact per product (0–100)</small></h2><div class="card">${matrix}</div>` : ''}
<h2>Products</h2>
${aggs.map(productCard).join('')}
<footer>Impact = reach among unhappy buyers (40) + estimated share of all buyers (15) + severity (25) + credibility from helpful votes and verified purchases (10) + trend (10). “Est. % of buyers” re-weights the collected reviews by the product's star histogram; “≥” means some star levels were not sampled. Quotes link to the original review.</footer>
</main></body></html>`;
}
