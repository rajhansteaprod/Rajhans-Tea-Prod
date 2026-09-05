import mongoose from 'mongoose';

jest.mock('../../../src/modules/seo/models/seo-recommendation.model', () => ({
  SeoRecommendation: {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  },
}));

import { SeoRecommendation } from '../../../src/modules/seo/models/seo-recommendation.model';
import {
  emitContentRecommendations,
  previewContentRecommendations,
  resolveMissingContentRecommendations,
  upsertContentRecommendations,
} from '../../../src/modules/seo/content/services/content-recommendation.service';
import { ContentPageAnalysis } from '../../../src/modules/seo/content/content.types';

const RUN = new mongoose.Types.ObjectId();

const execResult = <T>(value: T) => ({
  exec: jest.fn().mockResolvedValue(value),
});

const analysis = (
  over: Partial<ContentPageAnalysis> = {},
): ContentPageAnalysis => ({
  normalizedUrl: 'https://rajhanstea.com/page/faq/',
  canonicalUrl: 'https://rajhanstea.com/page/faq/',
  pageType: 'static',
  sourceRef: {
    model: 'cms_page',
    documentId: 'abc123',
    slug: 'faq',
  },

  analyzerVersion: '6.1.0-content-v3',
  extractorVersion: '6.1.0-extract-v2',
  analyzedAt: new Date('2026-09-05T00:00:00Z'),
  inputsHash: 'inputs-hash',
  evidenceWindowKey: 'run:test',
  evidenceWindow: {
    auditRunId: RUN.toString(),
    auditRunAt: new Date('2026-09-05T00:00:00Z'),
    auditRunStatus: 'completed',
    snapshotContentHash: 'snapshot-hash',
    gscPeriodStart: null,
    gscPeriodEnd: null,
    marketEvidenceAt: null,
  },

  currentState: {
    title: 'Frequently Asked Questions — Rajhans Tea — Rajhans Tea',
    titleLength: 54,
    metaDescription: 'FAQ description',
    metaDescriptionLength: 15,
    canonical: 'https://rajhanstea.com/page/faq/',
    robotsMeta: null,
    h1: ['FAQs'],
    h2: ['Frequently Asked Questions'],
    h3: [],
    headingOutline: [
      { level: 1, text: 'FAQs' },
      { level: 2, text: 'Frequently Asked Questions' },
    ],
    wordCount: 250,
    visibleWordCount: 186,
    contentHash: 'content-hash',
    normalizedTextChars: 1000,
    normalizedTextTruncated: false,
    faqSignals: {
      questionHeadings: 6,
      faqHeadingPresent: true,
      faqSchemaPresent: false,
    },
    structuredDataTypes: ['Organization'],
    internalLinks: {
      inboundCount: 10,
      outboundCount: 10,
      outboundTargets: [],
    },
    indexable: true,
    inSitemap: true,
    captureComplete: true,
    extractorVersion: '6.1.0-extract-v2',
  },

  searchPerformance: {
    known: false,
    period: null,
    totals: null,
    queryCount: 0,
    queries: [],
    queriesTruncated: false,
  },

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

  existingWork: {
    openIssueCheckIds: [],
    openRecommendations: [],
  },

  topicCoverage: [],

  opportunities: [
    {
      type: 'metadata-opportunity',
      priority: 'low',
      evidenceStrength: 'high',
      explanation:
        'Metadata needs attention: the rendered title repeats the trailing segment "Rajhans Tea".',
      affectedQueries: [],
      evidence: [
        {
          source: 'snapshot',
          collection: 'SeoPageSnapshot',
          key: 'faq',
          observedAt: new Date('2026-09-05T00:00:00Z'),
          freshness: 'fresh',
          summary: 'title repeated',
          facts: {
            repeatedTrailingTitleSegment: 'Rajhans Tea',
          },
        },
      ],
      discriminator:
        'https://rajhanstea.com/page/faq/::metadata',
    },
  ],

  missingEvidence: [],

  executability: {
    status: 'executable',
    reason: 'CMS metadata is writable',
    supportedFields: ['metaTitle', 'metaDescription'],
    targetType: 'cms_page',
  },

  ...over,
});

describe('Phase 6.2 content recommendation emission', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('previews insufficient-evidence as suppressed without querying or writing recommendations', async () => {
    const a = analysis({
      opportunities: [
        {
          type: 'insufficient-evidence',
          priority: 'low',
          evidenceStrength: 'low',
          explanation: 'Not enough evidence',
          affectedQueries: [],
          evidence: [
            {
              source: 'gsc',
              collection: 'GscQueryPageMetric',
              key: 'faq',
              observedAt: new Date(),
              freshness: 'unknown',
              summary: 'no rows',
              facts: {},
            },
          ],
          discriminator: 'faq::insufficient',
        },
      ],
    });

    const preview = await previewContentRecommendations([a]);

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      opportunityType: 'insufficient-evidence',
      action: 'suppressed',
      recommendationId: null,
      fingerprint: null,
      approvalPropensity: 'monitoring',
    });

    expect(SeoRecommendation.findOne).not.toHaveBeenCalled();
    expect(SeoRecommendation.create).not.toHaveBeenCalled();
  });

  it('previews new, update and reopen states read-only', async () => {
    const leanExec = (value: unknown) => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });

    (SeoRecommendation.findOne as jest.Mock)
      .mockReturnValueOnce(leanExec(null))
      .mockReturnValueOnce(leanExec({ status: 'open' }))
      .mockReturnValueOnce(leanExec({ status: 'resolved' }));

    const first = await previewContentRecommendations([analysis()]);

    const secondAnalysis = analysis({
      opportunities: [
        {
          ...analysis().opportunities[0],
          discriminator: 'https://rajhanstea.com/page/faq/::metadata-two',
        },
      ],
    });
    const second = await previewContentRecommendations([secondAnalysis]);

    const thirdAnalysis = analysis({
      opportunities: [
        {
          ...analysis().opportunities[0],
          discriminator: 'https://rajhanstea.com/page/faq/::metadata-three',
        },
      ],
    });
    const third = await previewContentRecommendations([thirdAnalysis]);

    expect(first[0].action).toBe('new');
    expect(second[0].action).toBe('update');
    expect(third[0].action).toBe('reopen');

    expect(SeoRecommendation.create).not.toHaveBeenCalled();
    expect(SeoRecommendation.find).not.toHaveBeenCalled();
  });

  it('classifies high-evidence executable metadata as recommended to approve', async () => {
    const leanExec = (value: unknown) => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });

    (SeoRecommendation.findOne as jest.Mock).mockReturnValue(leanExec(null));

    const preview = await previewContentRecommendations([analysis()]);

    expect(preview[0]).toMatchObject({
      opportunityType: 'metadata-opportunity',
      approvalPropensity: 'recommended_to_approve',
    });
  });

  it('classifies recommendation-only findings as needs review', async () => {
    const leanExec = (value: unknown) => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });

    (SeoRecommendation.findOne as jest.Mock).mockReturnValue(leanExec(null));

    const a = analysis({
      executability: {
        status: 'recommendation_only',
        reason: 'No executor',
        supportedFields: [],
        targetType: null,
      },
      opportunities: [
        {
          ...analysis().opportunities[0],
          type: 'thin-content',
          evidenceStrength: 'medium',
          discriminator: 'faq::thin',
        },
      ],
    });

    const preview = await previewContentRecommendations([a]);
    expect(preview[0].approvalPropensity).toBe('needs_review');
  });

  it('classifies low-priority executable guideline findings as low urgency', async () => {
    const leanExec = (value: unknown) => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });

    (SeoRecommendation.findOne as jest.Mock).mockReturnValue(leanExec(null));

    const a = analysis({
      opportunities: [
        {
          ...analysis().opportunities[0],
          evidenceStrength: 'medium',
          discriminator: 'faq::metadata-guideline',
        },
      ],
    });

    const preview = await previewContentRecommendations([a]);
    expect(preview[0].approvalPropensity).toBe('low_urgency');
  });

  it('never emits insufficient-evidence as an approval recommendation', async () => {
    const a = analysis({
      opportunities: [
        {
          type: 'insufficient-evidence',
          priority: 'low',
          evidenceStrength: 'low',
          explanation: 'Not enough evidence',
          affectedQueries: [],
          evidence: [
            {
              source: 'gsc',
              collection: 'GscQueryPageMetric',
              key: 'faq',
              observedAt: new Date(),
              freshness: 'unknown',
              summary: 'no rows',
              facts: {},
            },
          ],
          discriminator: 'faq::insufficient',
        },
      ],
    });

    const result = await upsertContentRecommendations(RUN, [a]);

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      reopened: 0,
      fingerprints: [],
    });

    expect(SeoRecommendation.findOne).not.toHaveBeenCalled();
    expect(SeoRecommendation.create).not.toHaveBeenCalled();
  });

  it('creates a content recommendation with provenance and executability', async () => {
    (SeoRecommendation.findOne as jest.Mock).mockReturnValue(
      execResult(null),
    );
    (SeoRecommendation.create as jest.Mock).mockResolvedValue({});

    const result = await upsertContentRecommendations(RUN, [analysis()]);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);

    expect(SeoRecommendation.create).toHaveBeenCalledTimes(1);

    const payload = (SeoRecommendation.create as jest.Mock).mock.calls[0][0];

    expect(payload.source).toBe('content');
    expect(payload.recommendationId).toBe(
      'content-opportunity:metadata-opportunity',
    );
    expect(payload.category).toBe('metadata');
    expect(payload.automationLevel).toBe('recommend');
    expect(payload.status).toBe('open');
    expect(payload.affectedUrls).toEqual([
      'https://rajhanstea.com/page/faq/',
    ]);

    expect(payload.approvalPropensity).toBe('recommended_to_approve');
    expect(payload.approvalReason).toMatch(/high-strength deterministic evidence/i);

    expect(payload.evidence).toMatchObject({
      opportunityType: 'metadata-opportunity',
      evidenceStrength: 'high',
      analyzerVersion: '6.1.0-content-v3',
      extractorVersion: '6.1.0-extract-v2',
      executability: {
        status: 'executable',
        targetType: 'cms_page',
      },
    });
  });

  it('updates an existing open recommendation without touching human review state', async () => {
    const existing: any = {
      status: 'open',
      reviewStatus: 'approved',
      reviewNote: 'Owner approved',
      lastSeenRunId: null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    (SeoRecommendation.findOne as jest.Mock).mockReturnValue(
      execResult(existing),
    );

    const result = await upsertContentRecommendations(RUN, [analysis()]);

    expect(result.updated).toBe(1);
    expect(result.reopened).toBe(0);
    expect(existing.reviewStatus).toBe('approved');
    expect(existing.reviewNote).toBe('Owner approved');
    expect(existing.status).toBe('open');
    expect(existing.save).toHaveBeenCalledTimes(1);
  });

  it('reopens a resolved recommendation without changing human review state', async () => {
    const existing: any = {
      status: 'resolved',
      resolvedRunId: new mongoose.Types.ObjectId(),
      reviewStatus: 'rejected',
      reviewNote: 'Previously rejected',
      lastSeenRunId: null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    (SeoRecommendation.findOne as jest.Mock).mockReturnValue(
      execResult(existing),
    );

    const result = await upsertContentRecommendations(RUN, [analysis()]);

    expect(result.reopened).toBe(1);
    expect(existing.status).toBe('open');
    expect(existing.resolvedRunId).toBeNull();
    expect(existing.reviewStatus).toBe('rejected');
    expect(existing.reviewNote).toBe('Previously rejected');
  });

  it('uses one stable fingerprint per recommendationId + discriminator', async () => {
    (SeoRecommendation.findOne as jest.Mock).mockReturnValue(
      execResult(null),
    );
    (SeoRecommendation.create as jest.Mock).mockResolvedValue({});

    const a = analysis();

    const first = await upsertContentRecommendations(RUN, [a]);
    const second = await upsertContentRecommendations(RUN, [a]);

    expect(first.fingerprints[0]).toBe(second.fingerprints[0]);
  });

  it('resolves a missing content opportunity when that detector was genuinely evaluated', async () => {
    const rec: any = {
      fingerprint: 'old-fingerprint',
      evidence: {
        opportunityType: 'metadata-opportunity',
      },
      status: 'open',
      resolvedRunId: null,
      lastSeenRunId: null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    (SeoRecommendation.find as jest.Mock).mockReturnValue(
      execResult([rec]),
    );

    const a = analysis({
      opportunities: [],
    });

    const result = await resolveMissingContentRecommendations(
      RUN,
      [a],
      [],
    );

    expect(result.resolved).toBe(1);
    expect(rec.status).toBe('resolved');
    expect(rec.resolvedRunId).toBe(RUN);

    expect(SeoRecommendation.find).toHaveBeenCalledWith({
      status: 'open',
      source: 'content',
      affectedUrls: a.normalizedUrl,
    });
  });

  it('does NOT resolve an opportunity whose detector is suppressed by missing evidence', async () => {
    const rec: any = {
      fingerprint: 'gsc-opportunity',
      evidence: {
        opportunityType: 'high-impression-low-ctr',
      },
      status: 'open',
      save: jest.fn().mockResolvedValue(undefined),
    };

    (SeoRecommendation.find as jest.Mock).mockReturnValue(
      execResult([rec]),
    );

    const a = analysis({
      opportunities: [],
      missingEvidence: [
        {
          source: 'gsc',
          reason: 'gsc_no_rows_for_page',
          suppressedOpportunityTypes: [
            'high-impression-low-ctr',
            'striking-distance',
          ],
          detail: 'No GSC rows',
        },
      ],
    });

    const result = await resolveMissingContentRecommendations(
      RUN,
      [a],
      [],
    );

    expect(result.resolved).toBe(0);
    expect(rec.status).toBe('open');
    expect(rec.save).not.toHaveBeenCalled();
  });

  it('resolution query is strictly source-scoped to content recommendations', async () => {
    (SeoRecommendation.find as jest.Mock).mockReturnValue(
      execResult([]),
    );

    await resolveMissingContentRecommendations(
      RUN,
      [analysis({ opportunities: [] })],
      [],
    );

    const query = (SeoRecommendation.find as jest.Mock).mock.calls[0][0];

    expect(query.source).toBe('content');
    expect(query.source).not.toBe('audit');
    expect(query.source).not.toBe('gsc');
    expect(query.source).not.toBe('market');
  });

  it('combined emission upserts then resolves using exactly the emitted fingerprint set', async () => {
    (SeoRecommendation.findOne as jest.Mock).mockReturnValue(
      execResult(null),
    );
    (SeoRecommendation.create as jest.Mock).mockResolvedValue({});
    (SeoRecommendation.find as jest.Mock).mockReturnValue(
      execResult([]),
    );

    const result = await emitContentRecommendations(
      RUN,
      [analysis()],
      { allowResolution: true },
    );

    expect(result.created).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.fingerprints).toHaveLength(1);
  });
});
