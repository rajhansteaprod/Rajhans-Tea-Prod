import { Request, Response } from 'express';
import { SearchService } from './services/search.service';
import { sendSuccess } from '../../utils/api-response';

const searchService = new SearchService();

// ─── Public ──────────────────────────────────────────────────────────────────

export const searchProducts = async (req: Request, res: Response) => {
  const {
    q,
    page,
    limit,
    sort,
    categoryId,
    categorySlug,
    collectionId,
    priceMin,
    priceMax,
    inStock,
    tags,
  } = req.query as Record<string, string | undefined>;

  const parsedTags = tags
    ? tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  const result = await searchService.search(
    {
      q: q || '',
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      sort: sort as any,
      categoryId,
      categorySlug,
      collectionId,
      priceMin: priceMin ? parseFloat(priceMin) : undefined,
      priceMax: priceMax ? parseFloat(priceMax) : undefined,
      inStock: inStock === 'true',
      tags: parsedTags,
    },
    {
      userId: req.user?.userId ?? null,
      sessionId: (req.headers['x-session-id'] as string) ?? null,
    },
  );

  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Search results',
    data: result.products,
    meta: result.meta,
    facets: result.facets,
    query: result.query,
  });
};

export const autocomplete = async (req: Request, res: Response) => {
  const { q, limit } = req.query as { q: string; limit?: string };
  const suggestions = await searchService.autocomplete(q, limit ? parseInt(limit, 10) : 8);
  sendSuccess(res, suggestions);
};

export const popularSearches = async (_req: Request, res: Response) => {
  const popular = await searchService.getPopularSearches();
  sendSuccess(res, popular);
};

// ─── Admin ───────────────────────────────────────────────────────────────────

export const adminGetAnalytics = async (_req: Request, res: Response) => {
  const [stats, popular, zeroResults] = await Promise.all([
    searchService.getAnalyticsStats(),
    searchService.getPopularQueries(),
    searchService.getZeroResultQueries(),
  ]);
  sendSuccess(res, { stats, popular, zeroResults });
};
