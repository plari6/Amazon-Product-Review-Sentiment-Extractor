// Library entry: use the pieces from your own code (Express API, n8n function, scheduled job).
export { loadSettings } from './config.js';
export { openStore, storePath } from './store.js';
export { Collector } from './scraper.js';
export { importFile } from './importer.js';
export { runAnalysis } from './pipeline.js';
export { writeReports, renderMarkdown } from './report/index.js';
export { renderHtml } from './report/html.js';
export { analyzeReviews, PROMPT_VERSION } from './analyze/classifier.js';
export { analyzeWithRules } from './analyze/rules.js';
export { aggregateProduct, aggregateMarket } from './analyze/aggregate.js';
export { parseProductPage, parseReviewsPage, detectBlock } from './amazon/parse.js';
export { parseTarget } from './amazon/marketplaces.js';
export { createRouterFromEnv } from './ai/index.js';
