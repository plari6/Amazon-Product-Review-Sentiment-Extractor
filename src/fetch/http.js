// Plain HTTP fetch with real-Chrome headers, a timeout and one retry on network errors / 5xx.
import { jitter, sleep } from '../util.js';

export const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

export async function httpGet(url, { timeoutMs = 20000, acceptLanguage = 'en-US,en;q=0.9', fetchImpl = fetch, retries = 1, cookie } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': CHROME_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': acceptLanguage,
          'Cache-Control': 'no-cache',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
      const body = await res.text();
      if (res.status >= 500 && attempt < retries) { await sleep(jitter(2500)); continue; }
      return { status: res.status, body, url: res.url || url, ms: Date.now() - t0 };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(jitter(2000));
    }
  }
  const e = new Error(`HTTP request failed: ${lastErr?.name === 'TimeoutError' ? 'timeout' : lastErr?.message}`);
  e.kind = 'network';
  throw e;
}
