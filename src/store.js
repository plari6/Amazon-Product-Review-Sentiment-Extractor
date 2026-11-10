// One JSON file per project (data/<project>.json): products, reviews, analysis cache, runs.
// Atomic writes; a corrupt file is moved aside instead of crashing the run.
import fs from 'node:fs';
import path from 'node:path';
import { slug, writeFileAtomic } from './util.js';

const EMPTY = () => ({ version: 1, products: {}, reviews: {}, analyses: {}, briefs: {}, runs: [] });

export function openStore(file, { memory = false } = {}) {
  let data = EMPTY();
  if (!memory && file && fs.existsSync(file)) {
    try {
      data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      const bad = `${file}.corrupt-${Date.now()}`;
      fs.renameSync(file, bad);
      console.warn(`[store] ${path.basename(file)} was unreadable; moved to ${path.basename(bad)} and started fresh.`);
    }
  }

  const store = {
    file,
    data,
    save() { if (!memory && file) writeFileAtomic(file, JSON.stringify(data)); },

    upsertProduct(p) {
      const prev = data.products[p.key] || {};
      const merged = { ...prev };
      for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length && prev[k]?.length)) merged[k] = v;
      merged.label = p.label || prev.label || shortLabel(merged);
      data.products[p.key] = merged;
      return merged;
    },
    products() { return Object.values(data.products); },
    product(key) { return data.products[key] || null; },
    findProduct(q) {
      if (!q) return null;
      const s = String(q).toLowerCase();
      return store.products().find((p) => p.key.toLowerCase() === s || p.asin?.toLowerCase() === s || p.label?.toLowerCase() === s || slug(p.label) === slug(q)) || null;
    },
    removeProduct(key) {
      delete data.products[key];
      for (const [id, r] of Object.entries(data.reviews)) if (r.productKey === key) delete data.reviews[id];
    },

    /**
     * Adds reviews, skipping known ids. Text fingerprints only dedupe long texts (copied / syndicated
     * reviews): short identical reviews ("Love it!") from different buyers are real. Returns count added.
     */
    addReviews(list) {
      const longText = (r) => `${r.title || ''} ${r.body || ''}`.length >= 120;
      const seen = new Set(Object.values(data.reviews).filter(longText).map((r) => `${r.productKey}|${r.fingerprint}`));
      let added = 0;
      for (const r of list) {
        if (data.reviews[r.id]) { data.reviews[r.id] = { ...data.reviews[r.id], helpful: r.helpful ?? data.reviews[r.id].helpful }; continue; }
        const fp = `${r.productKey}|${r.fingerprint}`;
        if (longText(r)) {
          if (seen.has(fp)) continue;
          seen.add(fp);
        }
        data.reviews[r.id] = r;
        added++;
      }
      return added;
    },
    reviews(productKey) {
      const all = Object.values(data.reviews);
      return productKey ? all.filter((r) => r.productKey === productKey) : all;
    },

    getAnalysis(hash) { return data.analyses[hash] || null; },
    setAnalysis(hash, a) { data.analyses[hash] = a; },

    addRun(run) { data.runs.push(run); if (data.runs.length > 200) data.runs.splice(0, data.runs.length - 200); },
  };
  return store;
}

function shortLabel(p) {
  if (p.brand && p.title) return `${p.brand} – ${p.title.replace(new RegExp(`^${p.brand}\\s*`, 'i'), '').split(/[,|–\-(]/)[0].trim().slice(0, 40)}`;
  if (p.title) return p.title.split(/[,|–(]/)[0].trim().slice(0, 50);
  return p.asin || p.key;
}

export function storePath(settings) {
  return path.join(settings.dataDir, `${slug(settings.project) || 'default'}.json`);
}
