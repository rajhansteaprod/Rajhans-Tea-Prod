// =============================================================================
// UNIT TESTS — SEO Phase 6.1 persistence, upsert identity and retention
//
// The model is mocked so these assert the CONTRACT (what is keyed on, what is
// written, what is pruned) without needing a database.
// =============================================================================

import mongoose from 'mongoose';

const updateOne = jest.fn();
const deleteMany = jest.fn();
const find = jest.fn();

jest.mock('../../../src/modules/seo/content/models/seo-content-page-analysis.model', () => ({
  SeoContentPageAnalysis: {
    updateOne: (...args: unknown[]) => ({ exec: () => updateOne(...args) }),
    deleteMany: (...args: unknown[]) => ({ exec: () => deleteMany(...args) }),
    find: (...args: unknown[]) => {
      find(...args);
      const chain = {
        sort: () => chain,
        skip: () => chain,
        select: () => chain,
        lean: () => chain,
        exec: () => Promise.resolve(findResult),
      };
      return chain;
    },
  },
}));

let findResult: { _id: mongoose.Types.ObjectId }[] = [];

import { persistAnalyses } from '../../../src/modules/seo/content/services/page-analysis.service';
import { ANALYZER_VERSION } from '../../../src/modules/seo/content/content.config';
import { ContentPageAnalysis } from '../../../src/modules/seo/content/content.types';

const URL_A = 'https://rajhanstea.com/page/about-us/';
const WINDOW = 'run:abc|gsc:2026-08-28|market:none';

function analysis(over: Partial<ContentPageAnalysis> = {}): ContentPageAnalysis {
  return {
    normalizedUrl: URL_A,
    canonicalUrl: URL_A,
    pageType: 'static',
    sourceRef: { model: 'Page', documentId: null, slug: 'about-us' },
    analyzerVersion: ANALYZER_VERSION,
    extractorVersion: '6.1.0-extract-v2',
    analyzedAt: new Date('2026-09-04T10:00:00Z'),
    inputsHash: 'a'.repeat(64),
    evidenceWindowKey: WINDOW,
    evidenceWindow: {
      auditRunId: 'abc',
      auditRunAt: new Date('2026-09-02T00:00:00Z'),
      auditRunStatus: 'completed',
      snapshotContentHash: 'deadbeef',
      gscPeriodStart: '2026-08-01',
      gscPeriodEnd: '2026-08-28',
      marketEvidenceAt: null,
    },
    currentState: {
      title: 'About Us',
      titleLength: 8,
      metaDescription: null,
      metaDescriptionLength: null,
      h1: ['About Us'],
      h2: [],
      h3: [],
      headingOutline: [{ level: 1, text: 'About Us' }],
      wordCount: 400,
      contentHash: 'deadbeef',
      normalizedTextChars: 2100,
      normalizedTextTruncated: false,
      faqSignals: { questionHeadings: 0, faqHeadingPresent: false, faqSchemaPresent: false },
      canonical: URL_A,
      robotsMeta: null,
      indexable: true,
      inSitemap: true,
      structuredDataTypes: [],
      internalLinks: { outboundCount: 4, inboundCount: 2, outboundTargets: [] },
      captureComplete: true,
      extractorVersion: '6.1.0-extract-v2',
    },
    searchPerformance: { known: false, period: null, totals: null, queries: [], queryCount: 0, queriesTruncated: false },
    marketEvidence: {
      known: false,
      freshness: 'unknown',
      keywords: [],
      keywordCount: 0,
      keywordsTruncated: false,
      clusters: [],
      serpSnapshotAt: null,
      openMarketRecommendationIds: [],
    },
    existingWork: { openIssueCheckIds: [], openRecommendations: [] },
    topicCoverage: [],
    opportunities: [],
    missingEvidence: [],
    executability: { status: 'executable', reason: 'resolved', supportedFields: ['metaTitle', 'metaDescription'], targetType: 'cms_page' },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findResult = [];
  updateOne.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });
  deleteMany.mockResolvedValue({ deletedCount: 0 });
});

describe('persistAnalyses — upsert identity', () => {
  it('keys on (normalizedUrl, analyzerVersion, evidenceWindowKey)', async () => {
    await persistAnalyses([analysis()]);
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(updateOne.mock.calls[0][0]).toEqual({
      normalizedUrl: URL_A,
      analyzerVersion: ANALYZER_VERSION,
      evidenceWindowKey: WINDOW,
    });
    expect(updateOne.mock.calls[0][2]).toEqual({ upsert: true });
  });

  it('reports an insert as created and an existing row as updated', async () => {
    updateOne.mockResolvedValueOnce({ upsertedCount: 1 });
    expect(await persistAnalyses([analysis()])).toMatchObject({ created: 1, updated: 0 });

    updateOne.mockResolvedValueOnce({ upsertedCount: 0, modifiedCount: 1 });
    expect(await persistAnalyses([analysis()])).toMatchObject({ created: 0, updated: 1 });
  });

  it('re-running against the same evidence window writes to the SAME key', async () => {
    await persistAnalyses([analysis()]);
    await persistAnalyses([analysis({ analyzedAt: new Date('2026-09-05T11:00:00Z') })]);
    expect(updateOne.mock.calls[0][0]).toEqual(updateOne.mock.calls[1][0]);
  });

  it('a new audit run or GSC period produces a DIFFERENT key, preserving history', async () => {
    await persistAnalyses([analysis()]);
    await persistAnalyses([analysis({ evidenceWindowKey: 'run:xyz|gsc:2026-09-25|market:none' })]);
    expect(updateOne.mock.calls[1][0].evidenceWindowKey).not.toBe(updateOne.mock.calls[0][0].evidenceWindowKey);
    expect(updateOne.mock.calls[1][0].normalizedUrl).toBe(updateOne.mock.calls[0][0].normalizedUrl);
  });

  it('a bumped analyzer version produces a DIFFERENT key, never rewriting history', async () => {
    await persistAnalyses([analysis()]);
    await persistAnalyses([analysis({ analyzerVersion: '6.1.1-content-v2' })]);
    expect(updateOne.mock.calls[1][0].analyzerVersion).not.toBe(updateOne.mock.calls[0][0].analyzerVersion);
  });
});

describe('persistAnalyses — what is written', () => {
  it('persists negative results, so an analysed-and-healthy page is on record', async () => {
    await persistAnalyses([analysis({ opportunities: [] })]);
    expect(updateOne.mock.calls[0][1].$set.opportunities).toEqual([]);
    expect(updateOne.mock.calls[0][1].$set.inputsHash).toBe('a'.repeat(64));
  });

  it('persists provenance, evidence and executability together', async () => {
    await persistAnalyses([analysis()]);
    const set = updateOne.mock.calls[0][1].$set;
    expect(set).toHaveProperty('evidenceWindow.snapshotContentHash', 'deadbeef');
    expect(set).toHaveProperty('extractorVersion', '6.1.0-extract-v2');
    expect(set).toHaveProperty('executability.status', 'executable');
    expect(set).toHaveProperty('missingEvidence');
    expect(set).toHaveProperty('topicCoverage');
  });

  it('converts a source document id to an ObjectId, and keeps null as null', async () => {
    const id = new mongoose.Types.ObjectId();
    await persistAnalyses([analysis({ sourceRef: { model: 'Page', documentId: id.toString(), slug: 'about-us' } })]);
    expect(String(updateOne.mock.calls[0][1].$set.sourceRef.documentId)).toBe(id.toString());

    jest.clearAllMocks();
    updateOne.mockResolvedValue({ upsertedCount: 1 });
    await persistAnalyses([analysis()]);
    expect(updateOne.mock.calls[0][1].$set.sourceRef.documentId).toBeNull();
  });
});

describe('applyAnalysisRetention', () => {
  it('applies an age cutoff and a per-page history cap', async () => {
    findResult = [{ _id: new mongoose.Types.ObjectId() }, { _id: new mongoose.Types.ObjectId() }];
    deleteMany.mockResolvedValue({ deletedCount: 2 });

    const res = await persistAnalyses([analysis()]);

    // Two deletes: one age-based, one per-page overflow.
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(deleteMany.mock.calls[0][0]).toHaveProperty('analyzedAt.$lt');
    expect(deleteMany.mock.calls[1][0]).toHaveProperty('_id.$in');
    expect(res.pruned).toBe(4);
  });

  it('prunes nothing when a page is within its history cap', async () => {
    findResult = [];
    const res = await persistAnalyses([analysis()]);
    // Only the age-based delete runs; no per-page overflow to remove.
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(res.pruned).toBe(0);
  });

  it('deduplicates URLs so one page is pruned once per run', async () => {
    await persistAnalyses([analysis(), analysis({ evidenceWindowKey: 'run:other|gsc:none|market:none' })]);
    // Same normalizedUrl twice ⇒ a single per-page retention pass.
    expect(find).toHaveBeenCalledTimes(1);
  });
});
