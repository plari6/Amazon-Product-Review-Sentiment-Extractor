// Settings from the environment (.env), with safe defaults.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

export function findChrome(env = process.env) {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const candidates = process.platform === 'win32'
    ? [
        path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData\\Local'), 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || undefined; // undefined = Puppeteer's own Chrome
}

export function loadSettings(env = process.env, overrides = {}) {
  const dataDir = path.resolve(overrides.dataDir || env.DATA_DIR || path.join(process.cwd(), 'data'));
  const s = {
    dataDir,
    project: overrides.project || env.PROJECT || 'default',
    defaultDomain: (env.AMAZON_DOMAIN || 'amazon.com').replace(/^www\./, ''),
    // Test/demo hook: serve every marketplace from one base URL (the fake store in src/demo.js).
    baseUrlOverride: env.AMAZON_BASE_URL || null,
    engine: env.ENGINE || 'auto', // auto | http | browser
    maxReviews: num(env.MAX_REVIEWS, 300),
    stars: env.STARS || 'critical', // critical (1-3) | all | "1,2" ...
    pagesPerFilter: num(env.PAGES_PER_FILTER, 10),
    pageDelayMs: num(env.PAGE_DELAY_MS, 3500),
    productDelayMs: num(env.PRODUCT_DELAY_MS, 6000),
    httpTimeoutMs: num(env.HTTP_TIMEOUT_MS, 20000),
    browserTimeoutMs: num(env.BROWSER_TIMEOUT_MS, 45000),
    headless: bool(env.HEADLESS, true),
    chromePath: findChrome(env),
    profileDir: path.resolve(env.CHROME_PROFILE_DIR || path.join(dataDir, 'chrome-profile')),
    proxyUrl: env.PROXY_URL || null,
    debugDir: env.DEBUG_DIR ? path.resolve(env.DEBUG_DIR) : null,
    aiBatchSize: num(env.AI_BATCH_SIZE, 15),
    aiConcurrency: num(env.AI_CONCURRENCY, 3),
    useAi: !overrides.noAi && bool(env.USE_AI, true),
    outDir: path.resolve(overrides.outDir || env.OUT_DIR || path.join(process.cwd(), 'out')),
    webhookUrl: env.REPORT_WEBHOOK_URL || null,
  };
  return s;
}
