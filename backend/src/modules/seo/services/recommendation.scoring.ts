import { RecommendationImpact, RecommendationPriority, ScoringSignals } from '../seo.types';

/**
 * Configurable priority/impact scoring for recommendations. Weights and the
 * priority/impact thresholds are read from env (with sane defaults) so scoring
 * can be tuned without code changes. Deterministic: same inputs → same score.
 */
export const scoringConfig = {
  weights: {
    homepageAffected: Number(process.env.SEO_SCORE_HOMEPAGE ?? 30),
    productPage: Number(process.env.SEO_SCORE_PRODUCT ?? 20),
    categoryPage: Number(process.env.SEO_SCORE_CATEGORY ?? 20),
    blogPage: Number(process.env.SEO_SCORE_BLOG ?? 10),
    multipleUrls: Number(process.env.SEO_SCORE_MULTIPLE ?? 10),
    indexabilityIssue: Number(process.env.SEO_SCORE_INDEXABILITY ?? 25),
    duplicateMetadata: Number(process.env.SEO_SCORE_DUPLICATE_META ?? 15),
  },
  priorityThresholds: {
    high: Number(process.env.SEO_PRIORITY_HIGH ?? 50),
    medium: Number(process.env.SEO_PRIORITY_MEDIUM ?? 30),
  },
  impactThresholds: {
    veryHigh: Number(process.env.SEO_IMPACT_VERY_HIGH ?? 65),
    high: Number(process.env.SEO_IMPACT_HIGH ?? 45),
    medium: Number(process.env.SEO_IMPACT_MEDIUM ?? 25),
  },
};

/** Classify a normalized URL into a page type used by the scoring weights. */
export function classifyUrl(url: string, baseUrl: string): 'homepage' | 'product' | 'category' | 'blog' | 'other' {
  let path: string;
  try {
    path = new URL(url, baseUrl).pathname;
  } catch {
    return 'other';
  }
  if (path === '/' ) return 'homepage';
  if (path.startsWith('/product/')) return 'product';
  if (path.startsWith('/catalog/')) return 'category';
  if (path.startsWith('/blog/')) return 'blog';
  return 'other';
}

export interface ScoreResult {
  score: number;
  priority: RecommendationPriority;
  impact: RecommendationImpact;
}

/**
 * Score a recommendation from its affected URLs + signal flags. Each page TYPE
 * contributes its weight ONCE (so scores stay bounded regardless of URL count);
 * "multiple URLs affected" and the categorical signals add their flat weights.
 */
export function scoreRecommendation(
  affectedUrls: string[],
  baseUrl: string,
  signals: ScoringSignals = {},
): ScoreResult {
  const w = scoringConfig.weights;
  const types = new Set(affectedUrls.map((u) => classifyUrl(u, baseUrl)));

  let score = 0;
  if (types.has('homepage')) score += w.homepageAffected;
  if (types.has('product')) score += w.productPage;
  if (types.has('category')) score += w.categoryPage;
  if (types.has('blog')) score += w.blogPage;
  if (affectedUrls.length > 1) score += w.multipleUrls;
  if (signals.isIndexability) score += w.indexabilityIssue;
  if (signals.isDuplicateMetadata) score += w.duplicateMetadata;
  if (signals.bonus) score += signals.bonus;

  const p = scoringConfig.priorityThresholds;
  const priority: RecommendationPriority = score >= p.high ? 'high' : score >= p.medium ? 'medium' : 'low';

  const i = scoringConfig.impactThresholds;
  const impact: RecommendationImpact =
    score >= i.veryHigh ? 'very-high' : score >= i.high ? 'high' : score >= i.medium ? 'medium' : 'low';

  return { score, priority, impact };
}
