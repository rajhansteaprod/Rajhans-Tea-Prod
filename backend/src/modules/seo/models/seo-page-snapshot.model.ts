import mongoose, { Document, Schema } from 'mongoose';
import { FaqSignals, HeadingRef, ImageRef, InternalLinkRef, RedirectHop } from '../seo.types';

/**
 * The observed state of one URL during one run — the raw evidence behind any
 * issues on that URL, and the material for cross-run "what changed" comparisons
 * (canonical/title/schema deltas).
 */
export interface ISeoPageSnapshotDoc extends Document {
  runId: mongoose.Types.ObjectId;
  url: string;
  normalizedUrl: string;
  fetched: boolean;
  transientFailure: boolean;
  httpStatus: number | null;
  redirectChain: RedirectHop[];
  finalUrl: string | null;
  finalStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  robotsMeta: string | null;
  canonical: string | null;
  h1: string[];
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: string[];
  internalLinkDetails: InternalLinkRef[];
  images: ImageRef[];
  structuredDataTypes: string[];
  wordCount: number;
  contentHash: string | null;
  // ── Phase 6.1 content signals ──
  // All optional: a snapshot written before Phase 6.1 must keep hydrating and
  // serializing unchanged. `extractorVersion === null` is the authoritative
  // "content structure was never captured for this page" marker; analysis
  // treats that as MISSING EVIDENCE, never as "the page has no headings".
  h2: string[];
  h3: string[];
  headingOutline: HeadingRef[];
  normalizedText: string;
  normalizedTextChars: number;
  normalizedTextTruncated: boolean;
  faqSignals: FaqSignals | null;
  extractorVersion: string | null;
  inSitemap: boolean;
  fetchError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const redirectHopSchema = new Schema<RedirectHop>(
  { url: { type: String, required: true }, status: { type: Number, required: true } },
  { _id: false },
);

const seoPageSnapshotSchema = new Schema<ISeoPageSnapshotDoc>(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'SeoAuditRun', required: true, index: true },
    url: { type: String, required: true },
    normalizedUrl: { type: String, required: true },
    fetched: { type: Boolean, default: false },
    transientFailure: { type: Boolean, default: false },
    httpStatus: { type: Number, default: null },
    redirectChain: { type: [redirectHopSchema], default: [] },
    finalUrl: { type: String, default: null },
    finalStatus: { type: Number, default: null },
    title: { type: String, default: null },
    metaDescription: { type: String, default: null },
    robotsMeta: { type: String, default: null },
    canonical: { type: String, default: null },
    h1: { type: [String], default: [] },
    imagesTotal: { type: Number, default: 0 },
    imagesMissingAlt: { type: Number, default: 0 },
    internalLinks: { type: [String], default: [] },
    internalLinkDetails: {
      type: [new Schema<InternalLinkRef>({ href: String, target: String, anchor: String }, { _id: false })],
      default: [],
    },
    images: {
      type: [new Schema<ImageRef>({ src: { type: String, default: null }, alt: String, decorative: { type: Boolean, default: false } }, { _id: false })],
      default: [],
    },
    structuredDataTypes: { type: [String], default: [] },
    wordCount: { type: Number, default: 0 },
    contentHash: { type: String, default: null },
    h2: { type: [String], default: [] },
    h3: { type: [String], default: [] },
    headingOutline: {
      type: [new Schema<HeadingRef>({ level: { type: Number, required: true }, text: { type: String, default: '' } }, { _id: false })],
      default: [],
    },
    normalizedText: { type: String, default: '' },
    normalizedTextChars: { type: Number, default: 0 },
    normalizedTextTruncated: { type: Boolean, default: false },
    // No `default` — a pre-6.1 snapshot must hydrate with these UNSET rather
    // than being handed a fabricated "0 questions, no FAQ" observation.
    faqSignals: {
      type: new Schema<FaqSignals>(
        {
          questionHeadings: { type: Number, default: 0 },
          faqHeadingPresent: { type: Boolean, default: false },
          faqSchemaPresent: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: null,
    },
    extractorVersion: { type: String, default: null },
    inSitemap: { type: Boolean, default: false },
    fetchError: { type: String, default: null },
  },
  { timestamps: true },
);

seoPageSnapshotSchema.index({ runId: 1, normalizedUrl: 1 });

export const SeoPageSnapshot = mongoose.model<ISeoPageSnapshotDoc>(
  'SeoPageSnapshot',
  seoPageSnapshotSchema,
);
