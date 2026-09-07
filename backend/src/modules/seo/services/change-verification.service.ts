import mongoose from 'mongoose';
import { SeoChangePublication } from '../models/seo-change-publication.model';
import { SeoChangeExecution, ISeoChangeExecutionDoc, ExecutedTarget } from '../models/seo-change-execution.model';
import {
  SeoChangeVerification,
  ISeoChangeVerificationDoc,
  VerificationStatus,
  VerificationFetchInfo,
  VerificationExpected,
  VerificationObserved,
  VerificationMatches,
  VerifiedTarget,
} from '../models/seo-change-verification.model';
import { Page } from '../../cms/models/page.model';
import { Product } from '../../catalog/models/product.model';
import { fetchUrl } from './fetcher.service';
import { parseHtml } from './parser.service';
import { seoConfig } from '../seo.config';

/**
 * Phase 5.4A — post-execution verification. Manually re-checks a SUCCESSFUL
 * Phase 5.3 SeoChangeExecution against the LIVE PUBLIC page, using the same
 * fetch/parser stack the audit engine already uses (never a second crawler).
 * Purely read-only forensics: this never mutates Page, SeoChangeExecution,
 * SeoChangeDraft, or SeoRecommendation, never resolves a recommendation, and
 * never rolls anything back. Verification scope mirrors execution scope
 * exactly — CMS Page metadata (metaTitle/metaDescription) only.
 */
export const VERIFIER_VERSION = '5.4.0-post-execution-v1';

export type VerifyExecutionError = 'invalid_id' | 'not_found' | 'unsupported_state';

export type VerifyExecutionResult =
  | { ok: true; verification: ISeoChangeVerificationDoc }
  | { ok: false; error: VerifyExecutionError; message: string };

/** Mongo/the parser use '' and null respectively for "no description" — normalize for comparison only. */
function normalizeForCompare(value: string | null | undefined): string {
  return value ?? '';
}

const emptyFetchInfo = (requestedUrl: string, error: string): VerificationFetchInfo => ({
  requestedUrl,
  finalUrl: null,
  finalStatus: null,
  redirectChain: [],
  error,
  transient: false,
});

/**
 * A successful fetch is only trustworthy evidence for THIS target if it
 * actually terminated on the same canonical page — never verify metadata
 * pulled from a redirect that left the configured origin, or that landed on
 * a different Rajhans page entirely. Compares origin exactly and the
 * pathname trailing-slash-insensitively (fetchUrl/redirects don't guarantee
 * the exact trailing-slash form the draft recorded).
 */
function matchesIntendedTarget(intendedUrl: string, finalUrl: string): boolean {
  try {
    const intended = new URL(intendedUrl);
    const final = new URL(finalUrl);
    if (intended.origin.toLowerCase() !== final.origin.toLowerCase()) return false;
    const normalizePath = (p: string) => p.replace(/\/+$/, '') || '/';
    return normalizePath(intended.pathname) === normalizePath(final.pathname);
  } catch {
    return false;
  }
}

/**
 * Verify one execution target against the live public page. Only fields that
 * were actually part of the execution's `proposed` snapshot are checked — an
 * untouched field can never cause a mismatch, and `after` (not the draft's
 * `current`) is always the pre-verification baseline, since `after` is what
 * the execution actually confirmed was written.
 */
async function verifyCmsPageTarget(target: ExecutedTarget): Promise<VerifiedTarget> {
  const checkTitle = target.proposed.metaTitle !== undefined;
  const checkDescription = target.proposed.metaDescription !== undefined;

  const page = await Page.findById(target.targetDocumentId).exec();

  // The public state no longer matches the successful execution's assumptions
  // — a fact worth recording as a mismatch, not an inability to fetch.
  if (!page || page.status !== 'published') {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, !page ? 'page_missing' : 'page_unpublished'),
      expected: {},
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: [!page ? 'page_missing' : 'page_unpublished'],
    };
  }

  // Distinguish "execution succeeded, DB later changed" from "public renderer
  // mismatch" — only trust Page as the source of expected values if the raw
  // fields the execution wrote are still exactly what it wrote.
  const driftFields: string[] = [];
  if (checkTitle && normalizeForCompare(page.metaTitle) !== normalizeForCompare(target.after.metaTitle)) {
    driftFields.push('metaTitle_drift');
  }
  if (
    checkDescription &&
    normalizeForCompare(page.metaDescription) !== normalizeForCompare(target.after.metaDescription)
  ) {
    driftFields.push('metaDescription_drift');
  }
  if (driftFields.length) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, 'page_drifted_since_execution'),
      expected: {},
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: driftFields,
    };
  }

  const expected: VerificationExpected = {};
  if (checkTitle) expected.renderedTitle = `${page.metaTitle || page.title} — Rajhans Tea`;
  if (checkDescription) expected.metaDescription = page.metaDescription;

  const fetched = await fetchUrl(target.targetUrl);
  const fetchInfo: VerificationFetchInfo = {
    requestedUrl: fetched.requestedUrl,
    finalUrl: fetched.finalUrl,
    finalStatus: fetched.finalStatus,
    redirectChain: fetched.redirectChain,
    error: fetched.error,
    transient: fetched.transient,
  };

  // A normal metadata mismatch is never fetch_failed — this is strictly about
  // whether a terminal 200 HTML response was actually obtained.
  const fetchSucceeded = !fetched.transient && fetched.finalStatus === 200 && fetched.html !== null;
  if (!fetchSucceeded) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: fetchInfo,
      expected,
      observed: {},
      matches: {},
      status: 'fetch_failed',
      mismatchFields: [],
    };
  }

  // Redirect safety: a terminal 200 HTML response is only trustworthy evidence
  // for THIS target if it actually landed on the intended canonical page.
  // Never verify metadata pulled from a redirect that crossed origin, or that
  // landed on a different Rajhans page — a coincidentally-matching title
  // elsewhere must never be reported as "verified". target.targetUrl is
  // already a validated absolute URL (Phase 5.3 rejects anything else before
  // execution); fetched.finalUrl is redirect-chain-derived, so it alone gets
  // a defensive parse.
  let finalOrigin: string | null;
  try {
    finalOrigin = new URL(fetched.finalUrl).origin.toLowerCase();
  } catch {
    finalOrigin = null;
  }
  const intendedOrigin = new URL(target.targetUrl).origin.toLowerCase();
  if (finalOrigin !== intendedOrigin) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: fetchInfo,
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['cross_origin_redirect'],
    };
  }
  if (!matchesIntendedTarget(target.targetUrl, fetched.finalUrl)) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: fetchInfo,
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['redirected_to_different_page'],
    };
  }

  const parsed = parseHtml(fetched.html as string, fetched.finalUrl, seoConfig.baseUrl);
  const observed: VerificationObserved = {};
  const matches: VerificationMatches = {};
  const mismatchFields: string[] = [];

  if (checkTitle) {
    observed.renderedTitle = parsed.title;
    // Exact comparison, after the parser's own entity-decoding/whitespace
    // normalization — no suffix stripping here (unlike Phase 5.2 generation).
    matches.title = parsed.title === expected.renderedTitle;
    if (!matches.title) mismatchFields.push('title');
  }
  if (checkDescription) {
    observed.metaDescription = parsed.metaDescription;
    matches.metaDescription = normalizeForCompare(parsed.metaDescription) === normalizeForCompare(expected.metaDescription);
    if (!matches.metaDescription) mismatchFields.push('metaDescription');
  }

  return {
    targetUrl: target.targetUrl,
    targetDocumentId: target.targetDocumentId,
    fetch: fetchInfo,
    expected,
    observed,
    matches,
    status: mismatchFields.length ? 'mismatch' : 'verified',
    mismatchFields,
  };
}


function normalizePublicText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function verifyProductTarget(
  target: ExecutedTarget,
): Promise<VerifiedTarget> {
  const expectedDescription = target.after.description;

  if (expectedDescription === undefined) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(
        target.targetUrl,
        'execution_missing_product_description',
      ),
      expected: {},
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['description_missing'],
    };
  }

  const product = await Product.findById(
    target.targetDocumentId,
  ).exec();

  if (!product || product.status !== 'active') {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(
        target.targetUrl,
        !product
          ? 'product_missing'
          : 'product_inactive',
      ),
      expected: {
        description: expectedDescription,
      },
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: [
        !product
          ? 'product_missing'
          : 'product_inactive',
      ],
    };
  }

  if (
    (product.description ?? '') !==
    expectedDescription
  ) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(
        target.targetUrl,
        'product_drifted_since_execution',
      ),
      expected: {
        description: expectedDescription,
      },
      observed: {
        description: product.description ?? '',
      },
      matches: {
        description: false,
      },
      status: 'mismatch',
      mismatchFields: ['description_drift'],
    };
  }

  const fetched = await fetchUrl(target.targetUrl);

  const fetchInfo: VerificationFetchInfo = {
    requestedUrl: fetched.requestedUrl,
    finalUrl: fetched.finalUrl,
    finalStatus: fetched.finalStatus,
    redirectChain: fetched.redirectChain,
    error: fetched.error,
    transient: fetched.transient,
  };

  const expected: VerificationExpected = {
    description: expectedDescription,
  };

  const fetchSucceeded =
    !fetched.transient &&
    fetched.finalStatus === 200 &&
    fetched.html !== null;

  if (!fetchSucceeded) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: fetchInfo,
      expected,
      observed: {},
      matches: {},
      status: 'fetch_failed',
      mismatchFields: [],
    };
  }

  if (
    !matchesIntendedTarget(
      target.targetUrl,
      fetched.finalUrl,
    )
  ) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: fetchInfo,
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: [
        'redirected_to_different_page',
      ],
    };
  }

  const publicText = normalizePublicText(
    fetched.html as string,
  );

  const normalizedExpected =
    expectedDescription
      .replace(/\s+/g, ' ')
      .trim();

  const matchesDescription =
    publicText.includes(normalizedExpected);

  return {
    targetUrl: target.targetUrl,
    targetDocumentId: target.targetDocumentId,
    fetch: fetchInfo,
    expected,
    observed: {
      description: matchesDescription
        ? expectedDescription
        : null,
    },
    matches: {
      description: matchesDescription,
    },
    status: matchesDescription
      ? 'verified'
      : 'mismatch',
    mismatchFields: matchesDescription
      ? []
      : ['description'],
  };
}

/**
 * A confirmed mismatch is stronger evidence than an inability to verify
 * another target, so mismatch outranks fetch_failed when both are present.
 */
function aggregateStatus(targets: VerifiedTarget[]): VerificationStatus {
  if (targets.some((t) => t.status === 'mismatch')) return 'mismatch';
  if (targets.some((t) => t.status === 'fetch_failed')) return 'fetch_failed';
  return 'verified';
}

/**
 * Run one verification attempt for a successful execution, addressed by the
 * execution's own Mongo `_id`. Does NOT require the recommendation to still
 * be open/approved — the execution already happened; this is forensic
 * verification against that execution, not a re-run of the approval gate.
 */
export async function verifyExecution(opts: {
  executionId: string;
  verifierUserId: string;
}): Promise<VerifyExecutionResult> {
  const { executionId, verifierUserId } = opts;
  if (!mongoose.isValidObjectId(executionId)) {
    return { ok: false, error: 'invalid_id', message: 'Invalid execution id' };
  }

  const execution: ISeoChangeExecutionDoc | null = await SeoChangeExecution.findById(executionId).exec();
  if (!execution) return { ok: false, error: 'not_found', message: 'Execution not found' };
  if (execution.status !== 'succeeded') {
    return { ok: false, error: 'unsupported_state', message: 'Only a successful execution can be verified' };
  }

  // Phase 5.4 publication gate.
  //
  // New prerender-dependent executions carry a SeoChangePublication record.
  // They must not be verified against stale public HTML before the publisher
  // has rebuilt and deployed the frontend.
  //
  // No publication record means a historical pre-publication-layer execution,
  // whose existing verification semantics are intentionally preserved.
  const publication = await SeoChangePublication.findOne({
    executionId: execution._id,
  }).exec();

  if (publication && publication.status !== 'published') {
    return {
      ok: false,
      error: 'unsupported_state',
      message: `Execution publication is "${publication.status}" and cannot be verified until it is published`,
    };
  }

  const targets: VerifiedTarget[] = [];

  for (const target of execution.targets) {
    targets.push(
      execution.targetType === 'product'
        ? await verifyProductTarget(target)
        : await verifyCmsPageTarget(target),
    );
  }
  const status = aggregateStatus(targets);

  const verification = await SeoChangeVerification.create({
    executionId: execution._id,
    recommendationId: execution.recommendationId,
    draftId: execution.draftId,
    verifierUserId: new mongoose.Types.ObjectId(verifierUserId),
    verifiedAt: new Date(),
    status,
    verifierVersion: VERIFIER_VERSION,
    targets,
  });

  return { ok: true, verification };
}

/** Verification history for one execution, newest first. Null ⇒ invalid id. Multiple attempts are expected and all kept. */
export async function listVerificationsForExecution(executionId: string): Promise<ISeoChangeVerificationDoc[] | null> {
  if (!mongoose.isValidObjectId(executionId)) return null;
  return SeoChangeVerification.find({ executionId }).sort({ verifiedAt: -1 }).exec();
}

/** Single verification by its own _id. Null ⇒ invalid id or not found. */
export async function getVerificationById(verificationId: string): Promise<ISeoChangeVerificationDoc | null> {
  if (!mongoose.isValidObjectId(verificationId)) return null;
  return SeoChangeVerification.findById(verificationId).exec();
}

export function toVerificationView(doc: ISeoChangeVerificationDoc) {
  return {
    id: String(doc._id),
    executionId: String(doc.executionId),
    recommendationId: String(doc.recommendationId),
    draftId: String(doc.draftId),
    verifierUserId: String(doc.verifierUserId),
    verifiedAt: doc.verifiedAt,
    status: doc.status,
    verifierVersion: doc.verifierVersion,
    targets: doc.targets.map((t) => ({
      targetUrl: t.targetUrl,
      targetDocumentId: String(t.targetDocumentId),
      fetch: t.fetch,
      expected: t.expected,
      observed: t.observed,
      matches: t.matches,
      status: t.status,
      mismatchFields: t.mismatchFields,
    })),
    createdAt: doc.createdAt,
  };
}
