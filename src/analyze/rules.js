// Non-AI analyzer: star rating + lexicon sentiment + taxonomy regexes with negation / hedge handling.
// Same output shape as the AI classifier, so reports work with or without keys.
import { CATEGORIES, PRAISE } from './taxonomy.js';
import { reviewText } from '../normalize.js';
import { clamp, round, truncate } from '../util.js';

const NEG_BEFORE = /\b(no|not|never|without|zero|hardly|barely any|isn'?t|wasn'?t|aren'?t|doesn'?t|didn'?t|don'?t|won'?t|hasn'?t|haven'?t|kein(e|en)?|nicht|pas|sin|nunca|ni)\s+(\w+\s+){0,2}$/i;
const HEDGE_BEFORE = /\b(worried|afraid|concerned|feared|expected|thought|scared|hoping|hope|in case|if it|unlike|other (brands?|bottles?|ones?)|my (old|previous|last) (one|bottle|brand)|previous (one|model)|competitors?)\b[^.!?]{0,40}$/i;
const SELF_NEG = /\b(no|not|n'?t|never|won'?t|nicht|pas|no)\b/i;

const POS_WORDS = /\b(love|loved|great|excellent|amazing|perfect|awesome|fantastic|recommend|happy|best|wonderful|impressed|sturdy|beautiful|works well|good)\b/gi;
const NEG_WORDS = /\b(bad|terrible|awful|horrible|worst|disappoint(ed|ing)?|poor|junk|garbage|useless|waste|broken?|return(ed)?|refund|cheap|flimsy|defective|avoid|regret|leak(s|ed|ing)?|annoying|frustrat(ed|ing)|not worth)\b/gi;
const RETURN_RE = /\b(return(ed|ing)? (it|them|this|the)|sent (it|them) back|asked for a refund|got a refund|requested a (refund|replacement)|replacement|zurückgeschickt|retourniert|renvoyé|devuelto)\b/i;

export const RULES_VERSION = 'rules-1';

function sentences(text) {
  return String(text).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function matchIn(sentence, pattern) {
  const lower = sentence.toLowerCase();
  pattern.lastIndex = 0;
  const m = pattern.exec(lower);
  if (!m) return null;
  const before = lower.slice(Math.max(0, m.index - 60), m.index);
  if (!SELF_NEG.test(m[0]) && NEG_BEFORE.test(before)) return null;
  if (HEDGE_BEFORE.test(before)) return null;
  return m[0];
}

export function analyzeWithRules(review) {
  const text = reviewText(review);
  const parts = sentences(text);
  const rating = review.rating;
  const flaws = new Map();
  const praises = new Map();

  for (const s of parts) {
    for (const cat of CATEGORIES) {
      for (const issue of cat.issues) {
        if (flaws.has(issue.key)) continue;
        if (issue.patterns.some((p) => matchIn(s, p))) {
          let sev = cat.severity + (rating === 1 ? 1 : 0) - (rating >= 4 ? 1 : 0);
          if (cat.key === 'safety') sev = 5;
          flaws.set(issue.key, { key: issue.key, label: issue.label, category: cat.key, severity: clamp(sev, 1, 5), quote: truncate(s, 220) });
        }
      }
    }
    for (const p of PRAISE) {
      if (!praises.has(p.key) && p.patterns.some((re) => matchIn(s, re))) praises.set(p.key, { key: p.key, label: p.label, category: p.category, quote: truncate(s, 220) });
    }
  }

  // A 4-5 star review praising something is not a flaw report for the same thing ("no leaks" handled by negation).
  if (rating >= 4) for (const [k, f] of flaws) if (f.category === 'leaks' && praises.has('no-leaks')) flaws.delete(k);
  // Generic "doesn't work" is redundant when a more specific failure was found.
  if (flaws.size > 1 && flaws.has('does-not-work')) flaws.delete('does-not-work');

  const pos = (text.match(POS_WORDS) || []).length;
  const neg = (text.match(NEG_WORDS) || []).length;
  const lex = pos + neg ? (pos - neg) / (pos + neg) : 0;
  const base = rating ? { 1: -0.9, 2: -0.6, 3: -0.05, 4: 0.5, 5: 0.85 }[rating] : null;
  const score = clamp(base === null ? lex * 0.8 : base * 0.75 + lex * 0.25, -1, 1);
  let sentiment = score <= -0.25 ? 'negative' : score >= 0.25 ? 'positive' : 'neutral';
  if (flaws.size && praises.size && Math.abs(score) < 0.6) sentiment = 'mixed';
  else if (sentiment === 'neutral' && flaws.size && praises.size) sentiment = 'mixed';

  return {
    sentiment,
    score: round(score, 2),
    flaws: [...flaws.values()].slice(0, 5),
    praises: [...praises.values()].slice(0, 4),
    returnRisk: RETURN_RE.test(text) && score < 0.25,
    by: 'rules',
  };
}
