// Stealth Chrome (puppeteer-extra + stealth plugin) with a persistent profile, so one manual
// `login` keeps the Amazon session for later headless runs. One page at a time per run (polite).
import fs from 'node:fs';
import path from 'node:path';
import { jitter, sleep } from '../util.js';

const CHALLENGE_TITLE = /just a moment|checking your browser|attention required|please wait/i;

export function profileExists(profileDir) {
  try { return fs.existsSync(path.join(profileDir, 'Default')) || fs.existsSync(path.join(profileDir, 'Local State')); } catch { return false; }
}

export function createBrowser(settings = {}) {
  let browserP = null;
  let pageP = null;
  const proxy = settings.proxyUrl ? new URL(settings.proxyUrl) : null;

  async function launch({ headless = settings.headless !== false } = {}) {
    const { default: puppeteer } = await import('puppeteer-extra');
    const { default: Stealth } = await import('puppeteer-extra-plugin-stealth');
    puppeteer.use(Stealth());
    const args = ['--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US,en', '--window-size=1366,900', '--disable-blink-features=AutomationControlled'];
    if (proxy) args.push(`--proxy-server=${proxy.protocol}//${proxy.host}`);
    if (settings.profileDir) fs.mkdirSync(settings.profileDir, { recursive: true });
    const b = await puppeteer.launch({
      headless,
      executablePath: settings.chromePath,
      userDataDir: settings.profileDir || undefined,
      args,
      defaultViewport: null,
    });
    b.on('disconnected', () => { browserP = null; pageP = null; });
    return b;
  }

  async function getBrowser(opts) {
    if (!browserP) browserP = launch(opts).catch((err) => { browserP = null; throw err; });
    return browserP;
  }

  async function getPage(opts) {
    if (!pageP) {
      pageP = (async () => {
        const b = await getBrowser(opts);
        const [first] = await b.pages();
        const page = first || await b.newPage();
        await page.setViewport({ width: 1280 + Math.floor(Math.random() * 160), height: 820 + Math.floor(Math.random() * 80) });
        if (proxy?.username) await page.authenticate({ username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const t = req.resourceType();
          if (t === 'image' || t === 'media' || t === 'font') req.abort().catch(() => {});
          else req.continue().catch(() => {});
        });
        return page;
      })().catch((err) => { pageP = null; throw err; });
    }
    return pageP;
  }

  const isBotCheck = (page) => page.$('form[action*="validateCaptcha"]').then(Boolean).catch(() => false);

  /**
   * Bot checks are never answered by the tool. In a visible window (HEADLESS=false) the person at the
   * keyboard can deal with it; we wait for them. Headless runs report it as "captcha" / blocked.
   */
  async function waitForPerson(page, url, timeoutMs = 120_000) {
    if (settings.headless !== false || !(await isBotCheck(page))) return false;
    (settings.log || console.error)('  Amazon shows a check in the Chrome window - please handle it there; waiting up to 2 minutes...');
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await sleep(2000);
      if (!(await isBotCheck(page))) {
        if (!page.url().includes(new URL(url).pathname)) await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
        return true;
      }
    }
    return false;
  }

  async function settle(page, waitForSelector) {
    for (let i = 0; i < 15 && CHALLENGE_TITLE.test(await page.title().catch(() => '')); i++) await sleep(1000);
    await Promise.all([
      page.waitForNetworkIdle({ idleTime: 600, timeout: 8000 }).catch(() => {}),
      waitForSelector ? page.waitForSelector(waitForSelector, { timeout: 8000 }).catch(() => {}) : null,
    ]);
    await page.evaluate(() => window.scrollBy(0, 400 + Math.random() * 600)).catch(() => {});
    await sleep(jitter(700));
  }

  /** Load a URL and return the rendered HTML. */
  async function fetchPage(url, { timeoutMs = settings.browserTimeoutMs || 45000, waitForSelector, acceptLanguage } = {}) {
    const page = await getPage();
    const t0 = Date.now();
    try {
      if (acceptLanguage) await page.setExtraHTTPHeaders({ 'Accept-Language': acceptLanguage });
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await settle(page, waitForSelector);
      if (await waitForPerson(page, url)) await settle(page, waitForSelector);
      return { status: resp?.status() ?? 0, body: await page.content(), url: page.url(), ms: Date.now() - t0 };
    } catch (err) {
      await screenshot(page, settings.debugDir, url);
      throw err;
    }
  }

  /**
   * Newer review pages load more reviews with a "Show 10 more reviews" button instead of page links.
   * Clicks it and returns the HTML once the review count grew (or null when there is nothing more).
   */
  async function showMore({ timeoutMs = 15000 } = {}) {
    const page = await getPage();
    const before = await page.$$eval('[data-hook="review"]', (els) => els.length).catch(() => 0);
    const btn = await page.$('[data-hook="show-more-button"]');
    if (!btn) return null;
    await btn.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await sleep(jitter(600));
    await btn.click().catch(() => {});
    try {
      await page.waitForFunction((n) => document.querySelectorAll('[data-hook="review"]').length > n, { timeout: timeoutMs }, before);
    } catch { return null; }
    await sleep(jitter(800));
    return { body: await page.content(), url: page.url() };
  }

  /** Opens a visible window on the sign-in page and waits until the user is signed in. */
  async function interactiveLogin(baseUrl, { timeoutMs = 10 * 60_000, log = console.log } = {}) {
    await close();
    const page = await getPage({ headless: false });
    await page.setRequestInterception(false);
    page.removeAllListeners('request');
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const signedIn = async () => page.evaluate(() => {
      const el = document.querySelector('#nav-link-accountList-nav-line-1, #nav-link-accountList');
      const t = (el?.textContent || '').trim();
      return Boolean(t) && !/sign in|anmelden|identifiez|identifícate|accedi|inloggen|تسجيل/i.test(t);
    }).catch(() => false);
    if (await signedIn()) return true;
    // "Your orders" always redirects to the sign-in page of that marketplace.
    await page.goto(`${baseUrl}/gp/css/order-history`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    log('Sign in to Amazon in the Chrome window that just opened (2FA is fine). Waiting...');
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await sleep(2500);
      if (!browserP) return false; // window closed
      const url = page.url();
      if (!/\/ap\/|\/ax\//.test(url) && await signedIn()) return true;
    }
    return false;
  }

  async function close() {
    const b = browserP && await browserP.catch(() => null);
    browserP = null;
    pageP = null;
    await b?.close().catch(() => {});
  }

  return { fetchPage, showMore, interactiveLogin, close, get launched() { return Boolean(browserP); } };
}


async function screenshot(page, dir, url) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${new URL(url).hostname}-${Date.now()}.png` ) });
  } catch { /* best effort */ }
}
