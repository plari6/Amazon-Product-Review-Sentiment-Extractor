#!/usr/bin/env node
// Loads .env from the current folder, then from the project folder (REVIEW_EXTRACTOR_SKIP_DOTENV=1 disables).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.REVIEW_EXTRACTOR_SKIP_DOTENV) {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ quiet: true });
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'), quiet: true });
}
const { main } = await import('../src/cli.js');
await main();
