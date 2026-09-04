// =============================================================================
// UNIT TESTS — SEO Phase 6.1 safety invariants
//
// These are STRUCTURAL guards, not behavioural ones. They assert what the
// Phase 6.1 module tree can even reach: a provider client that is never
// imported can never be called, and a write method that is never referenced can
// never fire. They fail loudly the moment a future edit reintroduces a paid
// call, a live fetch, an LLM dependency, or a production write into this phase.
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';

const CONTENT_DIR = path.join(__dirname, '../../../src/modules/seo/content');
const CLI_PATH = path.join(__dirname, '../../../scripts/content-analyze.ts');

/** Every .ts file in the Phase 6.1 module tree, plus its CLI when it exists. */
function phase61Sources(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) out.push({ file: full, source: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(CONTENT_DIR);
  if (fs.existsSync(CLI_PATH)) out.push({ file: CLI_PATH, source: fs.readFileSync(CLI_PATH, 'utf8') });
  return out;
}

/** Import specifiers, so a mention inside a comment never trips a guard. */
function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}

describe('Phase 6.1 — zero paid provider calls', () => {
  const sources = phase61Sources();

  it('analyses at least the modules this suite is meant to protect', () => {
    expect(sources.length).toBeGreaterThanOrEqual(5);
  });

  it('never imports a DataForSEO client, provider, pricing or cost module', () => {
    const offenders = sources.filter(({ source }) =>
      importSpecifiers(source).some((spec) => /dataforseo|provider\.registry|provider\.bootstrap|run-budget|cost-governor|market-cost-reservation/i.test(spec)),
    );
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });

  it('never imports the market pipeline or orchestrator, which can spend money', () => {
    const offenders = sources.filter(({ source }) =>
      importSpecifiers(source).some((spec) => /market-pipeline|market-orchestrator|market-run-lock/i.test(spec)),
    );
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });

  it('never imports a live SERP provider or overlap fetcher', () => {
    const offenders = sources.filter(({ source }) =>
      importSpecifiers(source).some((spec) => /serp-overlap\.provider|dataforseo-serp/i.test(spec)),
    );
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });
});

describe('Phase 6.1 — zero network access', () => {
  const sources = phase61Sources();

  it('never imports the SEO fetcher or the GSC API client', () => {
    const offenders = sources.filter(({ source }) =>
      importSpecifiers(source).some((spec) => /services\/fetcher\.service|services\/gsc\.client|gsc\.sync\.service/.test(spec)),
    );
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });

  it('never calls fetch/axios/http directly — page state comes from stored snapshots', () => {
    const offenders = sources.filter(({ source }) => /\b(?:await\s+)?fetch\s*\(|require\('https?'\)|from 'axios'/.test(source));
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });
});

describe('Phase 6.1 — zero LLM calls', () => {
  const sources = phase61Sources();

  it('never imports an LLM SDK or client', () => {
    const offenders = sources.filter(({ source }) =>
      importSpecifiers(source).some((spec) => /anthropic|openai|langchain|@google\/gen|cohere|ollama/i.test(spec)),
    );
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });
});

describe('Phase 6.1 — zero CMS / catalog / production writes', () => {
  const sources = phase61Sources();

  /**
   * The models this phase may READ but must never WRITE. Analysis is allowed to
   * load a Product's slug; it must never save one.
   */
  const READ_ONLY_MODELS = ['Product', 'Category', 'Page', 'Blog', 'SeoPageSnapshot', 'SeoIssue', 'SeoAuditRun', 'GscQueryPageMetric', 'SearchKeyword', 'SearchCluster'];
  const WRITE_METHODS = ['create', 'insertMany', 'updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite', 'replaceOne', 'save'];

  it.each(READ_ONLY_MODELS)('never calls a write method on %s', (model) => {
    const pattern = new RegExp(`\\b${model}\\s*\\.\\s*(?:${WRITE_METHODS.join('|')})\\s*\\(`);
    const offenders = sources.filter(({ source }) => pattern.test(source));
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });

  it('never writes SeoRecommendation — emission is deferred past the 6.1.7 checkpoint', () => {
    const pattern = new RegExp(`\\bSeoRecommendation\\s*\\.\\s*(?:${WRITE_METHODS.join('|')})\\s*\\(`);
    const offenders = sources.filter(({ source }) => pattern.test(source));
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });

  it('never imports the execution, rollback, verification or draft-generation services', () => {
    const offenders = sources.filter(({ source }) =>
      importSpecifiers(source).some((spec) => /change-execution\.service|change-rollback|change-verification|change-completion|change-draft-generator/.test(spec)),
    );
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });

  it('imports the preflight service for its capability descriptor only, never to execute', () => {
    const preflightImporters = sources.filter(({ source }) =>
      importSpecifiers(source).some((spec) => /change-execution-preflight/.test(spec)),
    );
    for (const { source } of preflightImporters) {
      // resolveCmsPageTarget + EXECUTION_CAPABILITY are read-only capability
      // probes; evaluatePreflight is the gate the executor runs and has no
      // business here.
      expect(source).not.toMatch(/evaluate(Change)?Preflight\s*\(/);
    }
  });
});

describe('Phase 6.1 — no scheduling', () => {
  const sources = phase61Sources();

  it('never registers a cron job or a queue worker', () => {
    const offenders = sources.filter(
      ({ source }) =>
        importSpecifiers(source).some((spec) => /node-cron|bullmq|jobs\/queues|jobs\/workers/.test(spec)) ||
        /\bcron\.schedule\s*\(|new Worker\s*\(|new Queue\s*\(/.test(source),
    );
    expect(offenders.map((o) => path.basename(o.file))).toEqual([]);
  });
});
