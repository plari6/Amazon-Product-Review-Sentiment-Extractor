// Small shared helpers (no dependencies).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Random delay around `ms` (±40%), so page loads do not look machine-timed. */
export const jitter = (ms) => Math.round(ms * (0.6 + Math.random() * 0.8));

export function semaphore(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

export const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

export function slug(s, max = 48) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max).replace(/-+$/g, '');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function cleanText(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Loose fingerprint used to drop near-duplicate reviews (same text posted twice, syndicated reviews). */
export function fingerprint(text) {
  return sha1(String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 400));
}

/** Parse "4.0 out of 5 stars", "4,0 von 5 Sternen", "5.0 de 5 estrellas" -> 4 */
export function parseStars(s) {
  const m = String(s || '').match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n >= 0 && n <= 5 ? n : null;
}

/** "1,234" / "1.234" / "1 234" -> 1234 */
export function parseCount(s) {
  const m = String(s || '').match(/\d[\d.,\s  ]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const MONTHS = {
  // en, de, fr, es, it, nl, pt (lower-case, accents stripped)
  january: 1, jan: 1, januar: 1, janvier: 1, enero: 1, gennaio: 1, januari: 1, janeiro: 1,
  february: 2, feb: 2, februar: 2, fevrier: 2, febrero: 2, febbraio: 2, februari: 2, fevereiro: 2,
  march: 3, mar: 3, marz: 3, maerz: 3, mars: 3, marzo: 3, maart: 3, marco: 3,
  april: 4, apr: 4, avril: 4, abril: 4, aprile: 4,
  may: 5, mai: 5, mayo: 5, maggio: 5, mei: 5, maio: 5,
  june: 6, jun: 6, juni: 6, juin: 6, junio: 6, giugno: 6, junho: 6,
  july: 7, jul: 7, juli: 7, juillet: 7, julio: 7, luglio: 7, julho: 7,
  august: 8, aug: 8, aout: 8, agosto: 8, augustus: 8,
  september: 9, sep: 9, sept: 9, septembre: 9, septiembre: 9, settembre: 9, setembro: 9,
  october: 10, oct: 10, oktober: 10, octobre: 10, octubre: 10, ottobre: 10, outubro: 10,
  november: 11, nov: 11, novembre: 11, noviembre: 11, novembro: 11,
  december: 12, dec: 12, dezember: 12, decembre: 12, diciembre: 12, dicembre: 12, dezembro: 12,
};

/**
 * Parse Amazon review date lines into ISO dates:
 * "Reviewed in the United States on March 3, 2025", "Rezension aus Deutschland vom 3. März 2025",
 * "Commenté en France le 3 mars 2025", "2025-03-03", "03/03/2025".
 */
export function parseReviewDate(s) {
  const raw = String(s || '');
  const t = raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/([a-z]+)\.? (\d{1,2}),? (\d{4})/); // March 3, 2025
  if (m && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2]);
  m = t.match(/(\d{1,2})\.? (?:de )?([a-z]+)\.?,? (?:de )?(\d{4})/); // 3. März 2025 / 3 de marzo de 2025
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  m = t.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/); // 03/03/2025 (assume month/day for US, day.month for dots)
  if (m) return t.includes('.') ? iso(+m[3], +m[2], +m[1]) : iso(+m[3], +m[1], +m[2]);
  const d = Date.parse(raw);
  return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
}

function iso(y, mo, d) {
  if (!(y > 1990 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "Reviewed in the United States on ..." -> "the United States" */
export function parseReviewCountry(s) {
  const m = String(s || '').match(/(?:reviewed in|rezension aus|comment[eé] en|recensito in|revisado en|beoordeeld in)\s+(.+?)\s+(?:on|vom|le|il|el|op)\s/i);
  return m ? m[1].replace(/^the /i, '').trim() : null;
}

export function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export const round = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);
export const pct = (n, d = 0) => (Number.isFinite(n) ? `${round(n * 100, d)}%` : '–');
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Minimal RFC-4180 CSV parser; detects `,` `;` or tab separators. Returns array of objects. */
export function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let q = false;
  for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** CSV cell for Excel: `;` separated (comma-decimal locales), quotes escaped, formula injection neutralised. */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {});
  return '﻿' + [cols.map(csvCell).join(';'), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(';'))].join('\r\n') + '\r\n';
}
