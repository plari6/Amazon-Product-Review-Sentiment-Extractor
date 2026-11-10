// Collects one Amazon product: page stats (anonymous) + review pages (needs a signed-in Chrome profile
// on most marketplaces since late 2024). HTTP first, stealth Chrome when HTTP is blocked or walled.
import { MARKETPLACES, parseStarsOption, parseTarget, productKey, productUrl, reviewsUrl } from './amazon/marketplaces.js';
import { detectBlock, parseProductPage, parseReviewsPage } from './amazon/parse.js';
import { createBrowser, profileExists } from './fetch/browser.js';
import { httpGet } from './fetch/http.js';
import { makeReview } from './normalize.js';
import { jitter, sleep } from './util.js';

export class Collector {
  constructor({ settings, store, log = () => {}, fetchImpl, browser } = {}) {
    this.s = settings;
    this.store = store;
    this.log = log;
    this.fetchImpl = fetchImpl;
    this._browser = browser || null;
  }

  browser() {
    if (!this._browser) this._browser = createBrowser(this.s);
    return this._browser;
  }

  async close() { await this._browser?.close(); }

  /** mode: 'http' | 'browser'. Returns { status, body, url, block } */
  async fetch(url, mode, lang) {
    const res = mode === 'browser'
      ? await this.browser().fetchPage(url, { acceptLanguage: lang, waitForSelector: '[data-hook="review"], #productTitle' })
      : await httpGet(url, { timeoutMs: this.s.httpTimeoutMs, acceptLanguage: lang, fetchImpl: this.fetchImpl });
    return { ...res, block: detectBlock({ status: res.status, url: res.url, html: res.body }) };
  }

  /**
   * @param {string} input ASIN / URL
   * @param {{ label?: string, own?: boolean, maxReviews?: number, stars?: string, sorts?: string[], engine?: string }} opts
   */
  async collect(input, opts = {}) {
    const t = parseTarget(input, this.s.defaultDomain);
    const key = productKey(t);
    const lang = MARKETPLACES[t.domain]?.lang || 'en-US,en;q=0.9';
    const engine = opts.engine || this.s.engine;
    const override = this.s.baseUrlOverride;
    const result = { key, asin: t.asin, domain: t.domain, status: 'ok', added: 0, seen: 0, notes: [], engine: null };
    const canBrowser = engine !== 'http';
    let mode = engine === 'browser' ? 'browser' : 'http';

    // 1. Product page: title, rating, histogram, Amazon's "Customers say" aspects.
    let page;
    try {
      page = await this.fetch(productUrl(t, override), mode, lang);
      if (page.block && ['captcha', 'blocked'].includes(page.block) && mode === 'http' && canBrowser) {
        this.log(`  product page: ${page.block} over HTTP, retrying in Chrome`);
        mode = 'browser';
        page = await this.fetch(productUrl(t, override), mode, lang);
      }
    } catch (err) {
      result.status = 'error';
      result.notes.push(`product page failed: ${err.message}`);
      return result;
    }
    if (page.block === 'not_found') { result.status = 'not_found'; result.notes.push('product not found (check ASIN / marketplace)'); return result; }
    if (page.block && page.block !== 'signin') { result.status = 'blocked'; result.notes.push(`product page ${page.block}: Amazon is checking this connection. Retry later or slower, set HEADLESS=false to handle the check yourself, use PROXY_URL, or import an export`); return result; }

    const info = parseProductPage(page.body, { domain: t.domain, baseUrlOverride: override });
    const product = this.store.upsertProduct({
      key, asin: t.asin, domain: t.domain, url: productUrl(t), source: 'amazon',
      title: info.title, brand: info.brand, price: info.price, rating: info.rating, ratingsCount: info.ratingsCount,
      histogram: info.histogram, summary: info.summary, insights: info.insights,
      label: opts.label, own: opts.own || undefined, scrapedAt: new Date().toISOString(),
    });
    result.label = product.label;
    const runSeen = new Map();
    const keep = (list) => { for (const r of list) if (r.body || r.title) runSeen.set(r.reviewId || `${r.title}|${r.body}`, r); };
    keep(info.reviews);

    // 2. Review pages, per star filter and sort order, until the budget is used.
    const max = opts.maxReviews ?? this.s.maxReviews;
    const stars = parseStarsOption(opts.stars || this.s.stars);
    const sorts = opts.sorts || ['recent', 'helpful'];
    const perStar = Math.ceil(max / stars.length);
    let walled = false;

    outer: for (const star of stars) {
      const startCount = runSeen.size;
      for (const sortBy of sorts) {
        if (runSeen.size - startCount >= perStar) break;
        for (let pageNo = 1; pageNo <= this.s.pagesPerFilter; pageNo++) {
          if (runSeen.size - startCount >= perStar || runSeen.size >= max) break;
          const url = reviewsUrl(t, { star, sortBy, page: pageNo }, override);
          let res;
          try {
            res = await this.fetch(url, mode, lang);
            if (res.block === 'signin' && mode === 'http' && canBrowser && profileExists(this.s.profileDir)) {
              this.log('  review pages need sign-in; switching to the saved Chrome profile');
              mode = 'browser';
              res = await this.fetch(url, mode, lang);
            } else if (res.block === 'captcha' && mode === 'http' && canBrowser) {
              mode = 'browser';
              res = await this.fetch(url, mode, lang);
            }
          } catch (err) {
            result.notes.push(`${star}★ ${sortBy} p${pageNo}: ${err.message}`);
            break;
          }
          if (res.block === 'signin') { walled = true; break outer; }
          if (res.block) { result.notes.push(`${star}★ page ${pageNo}: ${res.block}`); result.status = 'partial'; break outer; }

          const parsed = parseReviewsPage(res.body, { domain: t.domain, baseUrlOverride: override });
          const before = runSeen.size;
          keep(parsed.reviews);
          this.log(`  ${star}★ ${sortBy} p${pageNo}: ${parsed.reviews.length} reviews (${runSeen.size} total)`);
          if (!parsed.reviews.length) break;

          // "Show 10 more reviews" pages (no page links): click through in Chrome.
          if (!parsed.hasNext && parsed.hasShowMore && mode === 'browser') {
            while (runSeen.size - startCount < perStar && runSeen.size < max) {
              const more = await this.browser().showMore();
              if (!more) break;
              const b = runSeen.size;
              keep(parseReviewsPage(more.body, { domain: t.domain, baseUrlOverride: override }).reviews);
              if (runSeen.size === b) break;
              await sleep(jitter(this.s.pageDelayMs));
            }
            break;
          }
          if (!parsed.hasNext || runSeen.size === before) break;
          await sleep(jitter(this.s.pageDelayMs));
        }
      }
    }

    if (walled) {
      result.status = runSeen.size ? 'partial' : 'login_needed';
      result.notes.push(profileExists(this.s.profileDir)
        ? 'Amazon still asks for sign-in: run `review-extractor login` again (session expired).'
        : 'Full review pages need a signed-in Amazon account: run `review-extractor login` once, or import an export (CSV/JSON/saved HTML). Product stats and Amazon\'s aspect counts were saved.');
    }

    const reviews = [...runSeen.values()].map((r) => makeReview({ ...r, url: r.url && override ? r.url.replace(override, `https://www.${t.domain}`) : r.url }, { productKey: key }));
    result.seen = reviews.length;
    result.added = this.store.addReviews(reviews);
    result.engine = mode;
    this.store.upsertProduct({ key, lastCollect: { at: new Date().toISOString(), status: result.status, seen: result.seen, added: result.added, notes: result.notes } });
    return result;
  }

  /** Opens a visible Chrome window so the user can sign in once; the session is kept in the profile folder. */
  async login(domain = this.s.defaultDomain) {
    const ok = await this.browser().interactiveLogin(`https://www.${domain}`, { log: this.log });
    await this.close();
    return ok;
  }
}
