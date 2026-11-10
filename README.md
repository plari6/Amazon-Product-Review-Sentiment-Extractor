# Amazon Product Review Sentiment Extractor

Reads hundreds to thousands of Amazon reviews of competitor products and tells you **what is broken in each one, how badly, and what to build, claim and advertise instead.**

```
Top opportunities (flaws that hurt competitors most):
   89  Leaks  [3 competitor(s)]
       claim: 100% leak-proof – tested upside down in a bag for 24 h.
   70  Breaks / cracks quickly  [2 competitor(s)]
   54  Does not keep hot/cold  [1 competitor(s)]

HydroPeak 32 oz: 119 reviews, 58% negative, 4.3★/18432
  - Leaks: impact 96, 44 reviews, 48% of 1-2★, RISING
Where you are weaker: Paint / coating chips or peels, Too heavy
```

**Stack:** JavaScript (Node.js 22+ ESM). The work is scraping (Puppeteer + Cheerio) plus AI over HTTP, so one Node runtime with few dependencies is the simplest thing to run and hand over.

## What you get

For every product: rating, star histogram, Amazon's own "Customers say" summary and aspect counts, sentiment split, return/refund rate, and a **ranked list of flaws** with:

- an **impact score 0–100**,
- how many reviews mention it and what share of the 1–2★ reviews,
- an **estimated share of all buyers** affected (collected reviews re-weighted by the star histogram, so collecting mostly critical reviews doesn't skew it),
- severity 1–5, a **rising / falling trend** (last 90 days vs before),
- the 3 most helpful **quotes, each linked to the original review**.

Across products: a **flaw × competitor matrix**, pains that **no competitor solves**, where **your own product** is weaker or stronger, and an **opportunity brief**: product fix, Amazon-compliant listing claim, ad hook and supplier question for each flaw, plus 5 listing bullets to test.

Reports (in `out/`): **Excel** (Summary, Opportunities, Flaws, Matrix, Praise, Amazon aspects, Reviews, all with clickable links), a self-contained **HTML dashboard** (light/dark, phone friendly), a **Markdown brief**, CSVs (`;` separated, Excel-safe) and JSON.

## Quick start

```bash
npm install
npm run demo                 # offline: fake Amazon store, 4 bottle brands, ~390 reviews, every report
cp .env.example .env         # add GEMINI_API_KEY (and optionally GROQ / NVIDIA / OpenRouter keys)
node bin/review-extractor.js doctor --ping
```

> npm 11 may skip Puppeteer's Chrome download. That's fine: the tool uses your installed Chrome or Edge (auto-detected, or set `CHROME_PATH`).

## Getting reviews: three routes

| Route | Command | What you get |
|---|---|---|
| **Quick scan, no login** | `run <ASIN…>` | Title, price, rating, histogram, Amazon's AI summary and **aspect counts across all reviews** (e.g. "insulation: 162 of 260 negative"). Amazon has hidden full review lists from signed-out visitors since late 2024. |
| **Full reviews** | `login` once, then `run <ASIN…>` | A visible Chrome window opens, you sign in (2FA is fine) and the session stays in `data/chrome-profile`. The tool then walks the review pages per star filter (1★, 2★, 3★…) and sort order (recent, helpful): up to about 100 reviews per filter, about 1,000 per product with `--stars all`. |
| **Thousands of reviews** | `import file.csv` | Exports from Helium 10, Jungle Scout, Apify, Keepa, Seller Central, any spreadsheet (CSV / JSON / JSONL; column names are detected), or review pages saved from the browser (`.html`). |

```bash
R="node bin/review-extractor.js"
$R -p bottles run B0BSHF7WHW https://www.amazon.de/dp/B0XXXXXXX1 --niche "32 oz water bottles"
$R -p bottles run -f examples/products.csv --max 400 --stars all    # asin;label;own list
$R -p bottles import helium10-B0BSHF7WHW.csv --asin B0BSHF7WHW --label "Competitor A"
$R -p bottles import our-reviews.csv --asin B0OURS0001 --own
$R -p bottles analyze --format xlsx,html,md                         # re-run analysis + reports any time
```

**Being blocked.** Amazon checks automated traffic. When it shows a captcha or bot check, the tool stops and reports `blocked`. It never stores a check page as data and never tries to answer the check itself. Your options: run later at a slower pace (`PAGE_DELAY_MS`), use `HEADLESS=false` so you can handle the check yourself in the Chrome window, use a residential `PROXY_URL`, or use the import route. Scraping may conflict with Amazon's Conditions of Use. Keep volumes modest, use it for research, and for client work prefer exports from tools that hold Amazon data licences.

## Commands

| Command | What it does |
|---|---|
| `demo [--walled]` | Offline end-to-end demo (`--walled` shows the no-login mode) |
| `run <targets…>` | Scrape + analyse + reports. `-f list.csv`, `-l label`, `--own`, `-m 300`, `-s critical\|all\|positive\|1,2`, `--sort recent,helpful`, `-e auto\|http\|browser`, `-n niche`, `--format`, `--json` |
| `scrape <targets…>` | Collect only |
| `import <files…>` | CSV / JSON / JSONL / saved HTML. `--asin`, `--product`, `--label`, `--own`, `--domain` |
| `analyze` (alias `report`) | Analyse stored reviews, write reports. `--product`, `--force`, `--no-report`, `--json` |
| `products`, `remove <product>` | Manage the project |
| `classify "text" -r 2` | Analyse one review (check the AI / rules) |
| `login [--domain amazon.co.uk]` | One-time sign-in in a visible Chrome window |
| `doctor [--ping]` | Keys, Chrome, login profile, store; `--ping` tests every model |

Global: `-p <project>` (one store per client or niche in `data/<project>.json`), `-o <out dir>`, `--no-ai`, `--simulate-outage gemini` (shows the fallback), `--memory` (dry run), `-v`.

Targets: `B0BSHF7WHW`, `amazon.de:B0BSHF7WHW`, or any product / review URL from 20 marketplaces (US, CA, MX, BR, UK, DE, FR, IT, ES, NL, SE, PL, TR, AE, SA, EG, IN, JP, SG, AU).

## How it works

1. **Collect** (`src/scraper.js`): the product page is fetched over HTTP first (Cheerio), with stealth Chrome as a fallback. Review pages go through the saved Chrome profile when Amazon asks for sign-in. The tool supports page links and "Show more" buttons, randomised delays, and reports `ok | partial | login_needed | blocked | not_found`.
2. **Parse** (`src/amazon/parse.js`): reads Amazon's `data-hook` attributes for reviews, including international markup. Dates and stars are parsed in EN/DE/FR/ES/IT/NL/PT, along with helpful votes, Verified Purchase, Vine, variant, histogram and the "Customers say" aspects with their quotes.
3. **Analyse** (`src/analyze/classifier.js`): sends 15 reviews per prompt over the **multi-model fallback router** (`src/ai/`: Gemini → other Gemini versions → Groq → NVIDIA → OpenRouter → Ollama, with timeouts, cooldowns and hedging). The model returns flaws (specific key, category, severity, verbatim quote), praises, sentiment and return risk. Bad JSON sends the batch to the next model. Quotes that don't appear in the review are dropped as a hallucination guard. Results are cached by text hash, so the same review is never paid for twice. When every model fails, or there's no key, **keyword rules** (`src/analyze/rules.js`, with negation and hedge handling and some multilingual patterns) produce the same output shape.
4. **Aggregate** (`src/analyze/aggregate.js`): `impact = reach among 1–2★ reviews (40) + estimated buyer share (15) + severity (25) + credibility from helpful votes and verified purchases (10) + trend (10)`, scaled down for tiny samples. `opportunity = (0.6 × worst competitor impact + 0.4 × average impact) × breadth`.
5. **Brief** (`src/analyze/brief.js`): the AI writes the recommendations, but every number comes from code. If the AI is unavailable, a template brief built from the taxonomy's fixes and claims is used.

The fixed **taxonomy** (`src/analyze/taxonomy.js`: 17 categories, 45 issue types, 12 praise types) keeps products comparable. The AI can still add new issue keys, which are normalised through an alias map.

## Customising for a client

- **New niche:** run `demo` to show the client the output, then `-p <client> run -f their-competitors.csv --niche "…"`. Add their own ASIN with `own=yes` to get the "where you are weaker" section.
- **Niche-specific flaws** (e.g. supplements: taste, side effects; apparel: sizing): add issues with patterns, a fix and a claim to `taxonomy.js`, and synonyms to `KEY_ALIASES`. Then bump `PROMPT_VERSION` in `classifier.js` so cached analyses are redone.
- **Library use** (API, n8n, scheduled job): `import { openStore, Collector, importFile, runAnalysis, writeReports } from './src/index.js'`.
- **Docker:** `docker build -t review-extractor .` then `docker run --rm --env-file .env -v ./data:/app/data -v ./out:/app/out review-extractor demo`.

## Tests

`npm test` runs 19 tests with no network or keys. They cover the parser on Amazon-style markup (US and international), sign-in and captcha detection, the full scraper against the fake store (pagination, star filters, budgets, sign-in wall, captcha, 404), CSV / JSON / HTML imports, the rules (negation, look-alike words, DE/FR/ES), AI batches with a fake provider (bad JSON → next model, every model down → rules, cache, quote guard), aggregation maths, the market view, the brief (AI plus template fallback) and the CLI demo end to end.
