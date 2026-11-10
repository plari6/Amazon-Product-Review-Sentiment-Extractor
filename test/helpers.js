// Shared test helpers: a fake LLM provider that answers like a model (using the rules), temp dirs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLLMRouter, parseChain } from '../src/ai/index.js';
import { analyzeWithRules } from '../src/analyze/rules.js';

export const tmpDir = (name = 'rse') => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

/** Answers a batch prompt with JSON built from the keyword rules (what a good model would return). */
export function rulesAnswer(prompt) {
  const reviews = [...prompt.matchAll(/<review id="(r\d+)" stars="([\d?])"[^>]*>([\s\S]*?)<\/review>/g)];
  return JSON.stringify({
    reviews: reviews.map(([, id, stars, text]) => {
      const a = analyzeWithRules({ body: text, rating: stars === '?' ? null : Number(stars) });
      return { id, sentiment: a.sentiment, score: a.score, returnRisk: a.returnRisk, flaws: a.flaws, praises: a.praises };
    }),
  });
}

/**
 * Router over fake providers. `behaviour(modelName, req, call)` returns the text or throws.
 * Default: every model answers with rulesAnswer.
 */
export function fakeAi(behaviour = (m, req) => rulesAnswer(req.messages.at(-1).content), models = ['fake:model-a', 'fake:model-b']) {
  const calls = [];
  const provider = {
    configured: true,
    async complete(req) {
      calls.push(req.model);
      return { text: await behaviour(req.model, req, calls.length) };
    },
  };
  const router = createLLMRouter({ chain: parseChain(models), providers: { fake: provider }, hedgeAfterMs: 0, timeoutMs: 5000, totalBudgetMs: 20000 });
  router.calls = calls;
  return router;
}
