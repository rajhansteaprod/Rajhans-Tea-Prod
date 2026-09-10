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
import { Blog } from '../../cms/models/blog.model';
import { fetchUrl } from './fetcher.service';
import { parseHtml } from './parser.service';
import { seoConfig } from '../seo.config';
import { FaqItem } from './faq-schema.util';
import { extractLinks } from './blog-content-safety.util';

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Phase 6.4A — verify one internal-link execution against the LIVE public
 * blog page. Never accepts DB-only evidence: even though the DB write is
 * already confirmed by execution, this independently fetches the live page
 * and requires the exact `<a href="...">anchorText</a>` to be present and
 * crawlable in the returned HTML.
 */
async function verifyBlogTarget(target: ExecutedTarget): Promise<VerifiedTarget> {
  const expectedHref = target.after.linkTargetUrl;
  const expectedAnchor = target.after.linkAnchorText;

  if (!expectedHref || !expectedAnchor) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, 'execution_missing_link_data'),
      expected: {},
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['link_data_missing'],
    };
  }

  const expected: VerificationExpected = { linkTargetUrl: expectedHref, linkAnchorText: expectedAnchor };

  const blog = await Blog.findById(target.targetDocumentId).exec();
  if (!blog || blog.status !== 'published') {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, !blog ? 'blog_missing' : 'blog_unpublished'),
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: [!blog ? 'blog_missing' : 'blog_unpublished'],
    };
  }

  if ((blog.content ?? '') !== (target.after.content ?? '')) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, 'content_drifted_since_execution'),
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['content_drift'],
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

  const html = fetched.html as string;
  // Trailing-slash tolerant: the live href may or may not carry it depending
  // on how the source content stored it, but must match the origin+path.
  const hrefVariants = [expectedHref, expectedHref.replace(/\/+$/, ''), `${expectedHref.replace(/\/+$/, '')}/`];
  const anchorPattern = escapeRegExp(expectedAnchor);
  const linkPresent = hrefVariants.some((href) =>
    new RegExp(`<a\\b[^>]*\\bhref\\s*=\\s*"${escapeRegExp(href)}"[^>]*>\\s*${anchorPattern}\\s*<\\/a>`, 'i').test(html),
  );

  return {
    targetUrl: target.targetUrl,
    targetDocumentId: target.targetDocumentId,
    fetch: fetchInfo,
    expected,
    observed: { linkPresent },
    matches: { link: linkPresent },
    status: linkPresent ? 'verified' : 'mismatch',
    mismatchFields: linkPresent ? [] : ['link_missing'],
  };
}

/**
 * Phase 6.5A — verify one FAQ schema execution against the LIVE, PUBLISHED
 * page. DB/source-only success is never enough: this independently fetches
 * the live page and requires exactly one `FAQPage` JSON-LD block whose
 * `@context`/`@type` are correct, whose item count matches what execution
 * wrote, and whose every `Question.name`/`acceptedAnswer.text` is present in
 * the page's own VISIBLE (non-script) text — so a schema can never claim an
 * entry that isn't genuinely shown to a visitor.
 */
async function verifyFaqSchemaTarget(target: ExecutedTarget): Promise<VerifiedTarget> {
  const expectedSerialized = target.after.faqSchema;

  if (!expectedSerialized) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, 'execution_missing_faq_schema'),
      expected: {},
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['faq_schema_missing_from_execution'],
    };
  }

  let expectedParsed: { mainEntity?: unknown };
  try {
    expectedParsed = JSON.parse(expectedSerialized);
  } catch {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, 'execution_faq_schema_unparseable'),
      expected: { faqSchema: expectedSerialized },
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['faq_schema_unparseable'],
    };
  }
  const expectedItems: FaqItem[] = Array.isArray(expectedParsed.mainEntity)
    ? (expectedParsed.mainEntity as { name?: unknown; acceptedAnswer?: { text?: unknown } }[]).map((q) => ({
        question: typeof q.name === 'string' ? q.name : '',
        answer: typeof q.acceptedAnswer?.text === 'string' ? q.acceptedAnswer.text : '',
      }))
    : [];

  const expected: VerificationExpected = { faqSchema: expectedSerialized };

  const page = await Page.findById(target.targetDocumentId).exec();
  if (!page || page.status !== 'published') {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, !page ? 'page_missing' : 'page_unpublished'),
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: [!page ? 'page_missing' : 'page_unpublished'],
    };
  }

  if ((page.faqSchema ?? '') !== expectedSerialized) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, 'faq_schema_drifted_since_execution'),
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['faq_schema_drift'],
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

  const html = fetched.html as string;

  // Exactly one FAQPage JSON-LD block, never zero and never more than one.
  const scriptBlocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const faqBlocks: Record<string, unknown>[] = [];
  for (const block of scriptBlocks) {
    try {
      const parsed = JSON.parse(block[1].trim());
      if (parsed && typeof parsed === 'object' && parsed['@type'] === 'FAQPage') faqBlocks.push(parsed);
    } catch {
      // A malformed <script> block simply doesn't count as a valid FAQPage block.
    }
  }

  if (faqBlocks.length !== 1) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: fetchInfo,
      expected,
      observed: { faqSchema: null },
      matches: { faqSchema: false },
      status: 'mismatch',
      mismatchFields: [faqBlocks.length === 0 ? 'faq_schema_missing_on_page' : 'multiple_faq_schema_blocks'],
    };
  }

  const liveSchema = faqBlocks[0] as { '@context'?: unknown; '@type'?: unknown; mainEntity?: unknown };
  const observedSerialized = JSON.stringify(liveSchema);
  const mismatchFields: string[] = [];

  if (liveSchema['@context'] !== 'https://schema.org') mismatchFields.push('context_mismatch');
  if (liveSchema['@type'] !== 'FAQPage') mismatchFields.push('type_mismatch');

  const liveItems: FaqItem[] = Array.isArray(liveSchema.mainEntity)
    ? (liveSchema.mainEntity as { name?: unknown; acceptedAnswer?: { text?: unknown } }[]).map((q) => ({
        question: typeof q.name === 'string' ? q.name : '',
        answer: typeof q.acceptedAnswer?.text === 'string' ? q.acceptedAnswer.text : '',
      }))
    : [];

  if (liveItems.length !== expectedItems.length) mismatchFields.push('count_mismatch');

  // No hidden/invented entries: every Question.name and acceptedAnswer.text
  // in the live schema must literally appear in the page's own VISIBLE
  // (non-script/style) text — never trust the schema's own claims about
  // itself.
  const publicText = normalizePublicText(html);
  for (const item of liveItems) {
    const normalizedQuestion = item.question.replace(/\s+/g, ' ').trim();
    if (!normalizedQuestion || !publicText.includes(normalizedQuestion)) {
      mismatchFields.push('question_not_visible');
      break;
    }
  }
  for (const item of liveItems) {
    const normalizedAnswer = item.answer.replace(/\s+/g, ' ').trim();
    if (!normalizedAnswer || !publicText.includes(normalizedAnswer)) {
      mismatchFields.push('answer_not_visible');
      break;
    }
  }

  // Exact match against what execution wrote — the strongest possible check,
  // subsuming count/content equality when it passes.
  if (observedSerialized !== expectedSerialized) mismatchFields.push('schema_does_not_match_execution');

  return {
    targetUrl: target.targetUrl,
    targetDocumentId: target.targetDocumentId,
    fetch: fetchInfo,
    expected,
    observed: { faqSchema: observedSerialized },
    matches: { faqSchema: mismatchFields.length === 0 },
    status: mismatchFields.length ? 'mismatch' : 'verified',
    mismatchFields,
  };
}

/** Every `<h2>...</h2>`/`<h3>...</h3>`/`<p>...</p>` block's inner text, tags stripped, whitespace collapsed — used to confirm no major section is missing from the live page. */
function extractTextSegments(html: string): string[] {
  const segments: string[] = [];
  const pattern = /<(h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const text = m[2]!
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) segments.push(text);
  }
  return segments;
}

/**
 * Phase 6.6A — verify a brand-new blog article execution against the LIVE,
 * PUBLISHED, PRERENDERED page. DB/source-only success is never enough: this
 * independently fetches the live URL and requires the rendered H1/title/meta
 * description to match exactly, every approved paragraph/heading segment to
 * be present in the page's visible text, every approved internal link to be
 * present with its exact href/anchor, and the page to not be marked noindex.
 */
async function verifyBlogCreateTarget(target: ExecutedTarget): Promise<VerifiedTarget> {
  const expectedTitle = target.after.title;
  const expectedMetaTitle = target.after.metaTitle;
  const expectedMetaDescription = target.after.metaDescription;
  const expectedContent = target.after.content;
  const expectedSlug = target.after.slug;

  if (!expectedTitle || !expectedContent || !expectedSlug) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, 'execution_missing_blog_article_data'),
      expected: {},
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['blog_article_data_missing'],
    };
  }

  const requiredLinks = extractLinks(expectedContent) ?? [];
  const expected: VerificationExpected = {
    renderedTitle: expectedMetaTitle,
    metaDescription: expectedMetaDescription,
    h1: expectedTitle,
    bodyExcerpts: extractTextSegments(expectedContent),
    requiredLinks,
  };

  const blog = await Blog.findById(target.targetDocumentId).exec();
  if (!blog || blog.status !== 'published') {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, !blog ? 'blog_missing' : 'blog_unpublished'),
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: [!blog ? 'blog_missing' : 'blog_unpublished'],
    };
  }
  if (blog.slug !== expectedSlug || (blog.content ?? '') !== expectedContent) {
    return {
      targetUrl: target.targetUrl,
      targetDocumentId: target.targetDocumentId,
      fetch: emptyFetchInfo(target.targetUrl, 'blog_article_drifted_since_execution'),
      expected,
      observed: {},
      matches: {},
      status: 'mismatch',
      mismatchFields: ['content_drift'],
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

  const html = fetched.html as string;
  const parsed = parseHtml(html, fetched.finalUrl, seoConfig.baseUrl);
  const mismatchFields: string[] = [];

  const observedH1 = parsed.h1[0] ?? null;
  const titleOk = parsed.title === expectedMetaTitle;
  if (!titleOk) mismatchFields.push('title');
  const h1Ok = observedH1 === expectedTitle;
  if (!h1Ok) mismatchFields.push('h1');
  const descOk = normalizeForCompare(parsed.metaDescription) === normalizeForCompare(expectedMetaDescription);
  if (!descOk) mismatchFields.push('metaDescription');

  const normalizedBody = parsed.normalizedText;
  const bodyOk = (expected.bodyExcerpts ?? []).every((segment) => normalizedBody.includes(segment));
  if (!bodyOk) mismatchFields.push('body_missing_section');

  const linksOk = requiredLinks.every((link) => {
    const hrefVariants = [link.href, link.href.replace(/\/+$/, ''), `${link.href.replace(/\/+$/, '')}/`];
    const anchorPattern = escapeRegExp(link.anchor);
    return hrefVariants.some((href) =>
      new RegExp(`<a\\b[^>]*\\bhref\\s*=\\s*"${escapeRegExp(href)}"[^>]*>\\s*${anchorPattern}\\s*<\\/a>`, 'i').test(html),
    );
  });
  if (!linksOk) mismatchFields.push('links_missing');

  const noindex = !!parsed.robotsMeta && /noindex/i.test(parsed.robotsMeta);
  if (noindex) mismatchFields.push('page_noindex');

  const observed: VerificationObserved = {
    renderedTitle: parsed.title,
    metaDescription: parsed.metaDescription,
    h1: observedH1,
    bodyPresent: bodyOk,
    linksPresent: linksOk,
  };

  return {
    targetUrl: target.targetUrl,
    targetDocumentId: target.targetDocumentId,
    fetch: fetchInfo,
    expected,
    observed,
    matches: {
      title: titleOk,
      h1: h1Ok,
      metaDescription: descOk,
      body: bodyOk,
      links: linksOk,
    },
    status: mismatchFields.length ? 'mismatch' : 'verified',
    mismatchFields,
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
      execution.targetType === 'blog_create'
        ? await verifyBlogCreateTarget(target)
        : target.after.faqSchema !== undefined
          ? await verifyFaqSchemaTarget(target)
          : execution.targetType === 'product'
            ? await verifyProductTarget(target)
            : execution.targetType === 'blog'
              ? await verifyBlogTarget(target)
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
