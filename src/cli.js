// Command-line interface: review-extractor <command>
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { createRouterFromEnv } from './ai/index.js';
import { parseStarsOption, parseTarget } from './amazon/marketplaces.js';
import { analyzeWithRules } from './analyze/rules.js';
import { analyzeReviews } from './analyze/classifier.js';
import { loadSettings, PROJECT_ROOT } from './config.js';
import { DEMO_NICHE, DEMO_PRODUCTS, startFakeAmazon } from './demo.js';
import { profileExists } from './fetch/browser.js';
import { importFile } from './importer.js';
import { makeReview } from './normalize.js';
import { runAnalysis } from './pipeline.js';
import { ALL_FORMATS, writeReports } from './report/index.js';
import { Collector } from './scraper.js';
import { openStore, storePath } from './store.js';
import { parseCsv, pct, truncate } from './util.js';

const log = (...a) => console.error(...a);

function makeAi(settings, opts) {
  if (!settings.useAi) return null;
  const ai = createRouterFromEnv(process.env, {
    simulate: opts.simulateOutage ? String(opts.simulateOutage).split(',') : undefined,
    onEvent: (e) => { if (opts.verbose && (e.type === 'failure' || e.type === 'hedge')) log(`  [ai] ${e.type} ${e.target || ''} ${e.kind || ''} ${e.message ? truncate(e.message, 90) : ''}`); },
  });
  if (!ai.enabledCount) { log('No AI key configured (GEMINI_API_KEY, GROQ_API_KEY, ...): using keyword rules. Add a key to .env for AI analysis.'); return null; }
  return ai;
}

function ctx(program) {
  const o = program.opts();
  const settings = loadSettings(process.env, { project: o.project, dataDir: o.dataDir, noAi: o.ai === false, outDir: o.out });
  const store = openStore(storePath(settings), { memory: Boolean(o.memory) });
  return { o, settings, store };
}

function printSummary(result) {
  const { aggs, market, brief } = result;
  log('');
  if (brief?.headline) log(`★ ${brief.headline}`);
  if (market.opportunities.length) {
    log('\nTop opportunities (flaws that hurt competitors most):');
    for (const o of market.opportunities.slice(0, 6)) {
      const b = brief?.opportunities?.find((x) => x.key === o.key);
      log(`  ${String(o.opportunity).padStart(3)}  ${o.label}  [${o.competitorsAffected} competitor(s)]${b?.listingClaim ? `\n       claim: ${truncate(b.listingClaim, 100)}` : ''}`);
    }
  }
  for (const p of aggs) {
    log(`\n${p.label}${p.own ? ' (yours)' : ''}: ${p.collected} reviews, ${pct(p.negativeShare)} negative${p.rating ? `, ${p.rating}★/${p.ratingsCount}` : ''}`);
    for (const f of p.flaws.slice(0, 3)) log(`  - ${f.label}: impact ${f.impact}, ${f.mentions} reviews${f.shareOfNegative !== null ? `, ${pct(f.shareOfNegative)} of 1-2★` : ''}${f.trend === 'rising' ? ', RISING' : ''}`);
    if (!p.collected && p.insights?.length) for (const a of p.insights.filter((x) => x.negative).slice(0, 3)) log(`  - (Amazon aspect) ${a.aspect}: ${a.negative}/${a.mentions} negative`);
  }
  if (market.ownGaps.length) log(`\nWhere you are weaker: ${market.ownGaps.map((g) => g.label).join(', ')}`);
}

async function analyzeAndReport({ o, settings, store }, cmdOpts = {}) {
  if (cmdOpts.niche) store.data.niche = cmdOpts.niche;
  const ai = makeAi(settings, o);
  const result = await runAnalysis({ store, settings, ai, products: cmdOpts.product, log, force: cmdOpts.force, niche: cmdOpts.niche });
  const s = result.stats;
  log(`Analysis: ${s.ai} by AI, ${s.rules} by rules, ${s.cached} from cache${s.failedBatches ? `, ${s.failedBatches} AI batch(es) fell back to rules` : ''}${Object.keys(s.models).length ? ` (models: ${Object.entries(s.models).map(([m, n]) => `${m}×${n}`).join(', ')})` : ''}`);
  printSummary(result);
  if (cmdOpts.report !== false) {
    const formats = String(cmdOpts.format || ALL_FORMATS.join(',')).split(',').map((x) => x.trim()).filter((x) => ALL_FORMATS.includes(x));
    const files = await writeReports(result, { outDir: settings.outDir, formats, store, name: settings.project });
    log(`\nReports:\n${files.map((f) => `  ${f}`).join('\n')}`);
  }
  if (cmdOpts.json) process.stdout.write(`${JSON.stringify({ market: result.market, brief: result.brief, products: result.aggs.map(({ flaws, praises, ...p }) => ({ ...p, flaws: flaws.slice(0, 10).map(({ reviewIds, ...f }) => f) })) }, null, 2)}\n`);
  return result;
}

function readTargets(targets, file) {
  const list = (targets || []).map((t) => ({ target: t }));
  if (file) {
    const raw = fs.readFileSync(file, 'utf8');
    const rows = /\.json$/i.test(file) ? JSON.parse(raw) : parseCsv(raw);
    for (const r of rows) {
      const t = r.asin || r.ASIN || r.url || r.URL || r.target;
      if (t) list.push({ target: t, label: r.label || r.name || undefined, own: /^(1|true|yes|own)$/i.test(String(r.own || '')) });
    }
  }
  if (!list.length) throw new Error('Give at least one ASIN / Amazon URL (or --file products.csv).');
  return list;
}

async function scrapeAll(c, targets, opts) {
  const collector = new Collector({ settings: c.settings, store: c.store, log });
  const out = [];
  try {
    for (const [i, t] of targets.entries()) {
      const { asin, domain } = parseTarget(t.target, c.settings.defaultDomain);
      log(`[${i + 1}/${targets.length}] ${domain} ${asin}`);
      const r = await collector.collect(t.target, { label: t.label || (targets.length === 1 ? opts.label : undefined), own: t.own || (targets.length === 1 && opts.own), maxReviews: opts.max !== undefined ? Number(opts.max) : undefined, stars: opts.stars, engine: opts.engine, sorts: opts.sort ? String(opts.sort).split(',') : undefined });
      out.push(r);
      log(`  -> ${r.label || r.key}: ${r.status}, ${r.seen} reviews (${r.added} new)${r.engine ? ` via ${r.engine}` : ''}${r.notes.length ? `\n     ${r.notes.join('\n     ')}` : ''}`);
      c.store.save();
      if (i < targets.length - 1) await new Promise((res) => setTimeout(res, c.settings.productDelayMs));
    }
  } finally {
    await collector.close();
  }
  return out;
}

export function buildProgram() {
  const program = new Command();
  program
    .name('review-extractor')
    .description('Amazon review sentiment & flaw extractor: find the biggest weaknesses of competitor products.')
    .option('-p, --project <name>', 'project (one JSON store per client/niche)', process.env.PROJECT || 'default')
    .option('--data-dir <dir>', 'where project stores live (default ./data)')
    .option('-o, --out <dir>', 'report folder (default ./out)')
    .option('--no-ai', 'keyword rules only (no AI calls)')
    .option('--simulate-outage <providers>', 'pretend these AI providers are down, e.g. gemini (demo the fallback)')
    .option('--memory', 'do not save the project store (dry run)')
    .option('-v, --verbose', 'log AI fallbacks');

  const scrapeOpts = (cmd) => cmd
    .option('-f, --file <file>', 'CSV/JSON list of products (asin|url, label, own)')
    .option('-l, --label <name>', 'display name (single product)')
    .option('--own', 'mark as your own product (single product)')
    .option('-m, --max <n>', 'max reviews per product (default MAX_REVIEWS or 300; 0 = page stats only)')
    .option('-s, --stars <list>', 'critical (1-3, default) | all | positive | e.g. 1,2')
    .option('--sort <list>', 'review sort orders to walk, default recent,helpful')
    .option('-e, --engine <engine>', 'auto | http | browser');

  scrapeOpts(program.command('scrape').argument('[targets...]', 'ASINs or Amazon URLs').description('collect product stats + reviews into the project'))
    .action(async (targets, opts) => {
      const c = ctx(program);
      parseStarsOption(opts.stars || c.settings.stars);
      await scrapeAll(c, readTargets(targets, opts.file), opts);
    });

  scrapeOpts(program.command('run').argument('[targets...]', 'ASINs or Amazon URLs').description('scrape + analyse + reports in one go'))
    .option('-n, --niche <text>', 'niche name for the brief, e.g. "32 oz water bottles"')
    .option('--format <list>', `report formats (${ALL_FORMATS.join(',')})`)
    .option('--json', 'print the result as JSON on stdout')
    .action(async (targets, opts) => {
      const c = ctx(program);
      const results = await scrapeAll(c, readTargets(targets, opts.file), opts);
      if (results.every((r) => ['error', 'blocked', 'not_found'].includes(r.status)) && !c.store.reviews().length) { log('Nothing collected; no report written.'); process.exitCode = 2; return; }
      await analyzeAndReport(c, { ...opts, product: results.filter((r) => c.store.product(r.key)).map((r) => r.key) });
    });

  program.command('import').argument('<files...>', '.csv / .json / .jsonl exports or saved .html review pages')
    .description('import reviews from exports (Helium 10, Apify, Jungle Scout, sheets) or saved pages')
    .option('--asin <asin>', 'ASIN these reviews belong to (if the file has no asin column)')
    .option('--product <name>', 'product name (if no asin)')
    .option('-l, --label <name>', 'display name')
    .option('--own', 'mark as your own product')
    .option('--domain <domain>', 'marketplace for review links', 'amazon.com')
    .action(async (files, opts) => {
      const c = ctx(program);
      for (const f of files) {
        const r = importFile(path.resolve(f), c.store, opts);
        for (const p of r.products) log(`${path.basename(f)} -> ${p.label}: ${p.added} new of ${p.total} reviews`);
        if (r.skipped) log(`  skipped ${r.skipped} rows without text`);
      }
      c.store.save();
    });

  program.command('analyze').alias('report').description('analyse stored reviews and write reports')
    .option('--product <keys...>', 'only these products (key, ASIN or label)')
    .option('-n, --niche <text>', 'niche name for the brief')
    .option('--format <list>', `report formats (${ALL_FORMATS.join(',')})`)
    .option('--force', 're-analyse even cached reviews')
    .option('--no-report', 'print the summary only')
    .option('--json', 'print the result as JSON on stdout')
    .action(async (opts) => { await analyzeAndReport(ctx(program), opts); });

  program.command('products').alias('list').description('list products in the project')
    .action(() => {
      const { store, settings } = ctx(program);
      const list = store.products();
      if (!list.length) return log(`Project "${settings.project}" is empty.`);
      for (const p of list) log(`${p.key.padEnd(24)} ${String(store.reviews(p.key).length).padStart(5)} reviews  ${p.own ? '[own] ' : ''}${p.label}${p.lastCollect ? `  (last: ${p.lastCollect.status}, ${p.lastCollect.at.slice(0, 10)})` : ''}`);
    });

  program.command('remove').argument('<product>', 'key, ASIN or label').description('remove a product and its reviews')
    .action((q) => {
      const { store } = ctx(program);
      const p = store.findProduct(q);
      if (!p) { log(`No product "${q}"`); process.exitCode = 1; return; }
      store.removeProduct(p.key); store.save(); log(`Removed ${p.label}`);
    });

  program.command('classify').argument('<text>', 'review text').description('analyse one review (test the AI / rules)')
    .option('-r, --rating <n>', 'star rating 1-5')
    .action(async (text, opts) => {
      const c = ctx(program);
      const review = makeReview({ body: text, rating: opts.rating }, { productKey: 'cli:test', source: 'cli' });
      const ai = makeAi(c.settings, c.o);
      const { results } = await analyzeReviews([review], { ai, store: openStore(null, { memory: true }), settings: c.settings, log, force: true });
      process.stdout.write(`${JSON.stringify(results.get(review.id) || analyzeWithRules(review), null, 2)}\n`);
    });

  program.command('login').description('sign in to Amazon once in a visible Chrome window (needed for full review pages)')
    .option('--domain <domain>', 'marketplace, e.g. amazon.co.uk')
    .action(async (opts) => {
      const c = ctx(program);
      const collector = new Collector({ settings: { ...c.settings, headless: false }, store: c.store, log });
      const ok = await collector.login(opts.domain || c.settings.defaultDomain);
      log(ok ? `Signed in. Session saved in ${c.settings.profileDir}` : 'Not signed in (window closed or timed out).');
      if (!ok) process.exitCode = 1;
    });

  program.command('doctor').description('check AI keys, Chrome, login profile and store')
    .option('--ping', 'send a tiny prompt to every configured model')
    .action(async (opts) => {
      const c = ctx(program);
      const s = c.settings;
      log(`Project store : ${storePath(s)} (${c.store.products().length} products, ${c.store.reviews().length} reviews)`);
      log(`Chrome        : ${s.chromePath || "Puppeteer's bundled Chrome (none found; set CHROME_PATH)"}`);
      log(`Login profile : ${profileExists(s.profileDir) ? `found (${s.profileDir})` : 'none – run `review-extractor login` for full review pages'}`);
      log(`Proxy         : ${s.proxyUrl ? 'set' : 'none'}`);
      const ai = createRouterFromEnv(process.env, {});
      log(`AI models     : ${ai.enabledCount} enabled${ai.enabledCount ? '' : ' (keyword rules only – add GEMINI_API_KEY etc. to .env)'}`);
      for (const t of ai.status()) {
        let line = `  ${t.state.padEnd(8)} ${t.id}${t.disabledReason ? ` (${t.disabledReason})` : ''}`;
        if (opts.ping && t.enabled) {
          try {
            const r = await ai.generate({ only: t.id, messages: [{ role: 'user', content: 'Reply with the word OK.' }], maxTokens: 1024, timeoutMs: 20000 });
            line += `  -> ok ${r.ms} ms`;
          } catch (err) { line += `  -> ${err.attempts?.[0]?.kind || err.kind || 'error'}: ${truncate(err.attempts?.[0]?.error || err.message, 80)}`; }
        }
        log(line);
      }
    });

  program.command('demo').description('offline demo: fake Amazon store with 4 bottle brands, real scraper + analysis + reports')
    .option('--walled', 'make the fake store ask for sign-in on review pages (shows the no-login mode)')
    .option('--format <list>', `report formats (${ALL_FORMATS.join(',')})`)
    .action(async (opts) => {
      const o = program.opts();
      const settings = loadSettings({ ...process.env, PAGE_DELAY_MS: '0', PRODUCT_DELAY_MS: '0' }, { project: 'demo', noAi: o.ai === false, outDir: o.out || path.join(process.cwd(), 'out', 'demo') });
      const fake = await startFakeAmazon({ walled: Boolean(opts.walled) });
      settings.baseUrlOverride = fake.url;
      settings.profileDir = path.join(settings.dataDir, '__no_profile__');
      const store = openStore(null, { memory: true });
      const c = { o, settings, store };
      log(`Fake Amazon store running at ${fake.url} (${DEMO_PRODUCTS.length} products)\n`);
      try {
        await scrapeAll(c, DEMO_PRODUCTS.map((p) => ({ target: p.asin, label: p.label, own: p.own })), { max: 1000, stars: 'all', engine: 'http' });
      } finally { await fake.close(); }
      await analyzeAndReport(c, { niche: DEMO_NICHE, format: opts.format });
    });

  program.addHelpText('after', `
Examples:
  review-extractor demo                                   offline demo, no keys needed
  review-extractor login                                  one-time Amazon sign-in (full review pages)
  review-extractor -p bottles run B0BSHF7WHW B07XYZ1234 --niche "water bottles"
  review-extractor -p bottles run -f examples/products.csv --max 400 --stars all
  review-extractor -p bottles import helium10-export.csv --asin B07XYZ1234
  review-extractor -p bottles analyze --format xlsx,html
  review-extractor classify "Lid leaks after a week" --rating 2

Docs: ${path.join(PROJECT_ROOT, 'README.md')}`);
  return program;
}

export async function main(argv = process.argv) {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    log(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}
