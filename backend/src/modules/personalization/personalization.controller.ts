import { Request, Response } from 'express';
import { RecommendationService } from './services/recommendation.service';
import { FeedService } from './services/feed.service';
import { MerchandisingService } from './services/merchandising.service';
import { getPersonalizationQueue, PersonalizationJobs } from './jobs/queues/personalization.queue';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';

const recoService = new RecommendationService();
const feedService = new FeedService();
const merchandisingService = new MerchandisingService();

function getSessionId(req: Request): string {
  return (req.headers['x-session-id'] as string) || '';
}

// ─── Public ──────────────────────────────────────────────────────────────────

export const getHomepageFeed = async (req: Request, res: Response) => {
  const userId = req.user?.userId ?? null;
  const sessionId = getSessionId(req);
  const feed = await feedService.getHomepageFeed(userId, sessionId);
  sendSuccess(res, feed);
};

export const getTrending = async (_req: Request, res: Response) => {
  const products = await recoService.getTrendingNow(12);
  sendSuccess(res, products);
};

export const getRecentlyViewed = async (req: Request, res: Response) => {
  const userId = req.user?.userId ?? null;
  const sessionId = getSessionId(req);
  const products = await recoService.getRecentlyViewed(userId, sessionId, 12);
  sendSuccess(res, products);
};

export const trackView = async (req: Request, res: Response) => {
  const { productId } = req.body as { productId: string };
  const userId = req.user?.userId ?? null;
  const sessionId = getSessionId(req);

  await getPersonalizationQueue().add(
    PersonalizationJobs.TRACK_VIEW,
    { productId, userId, sessionId },
    { attempts: 2 },
  );

  res.status(202).json({ success: true, message: 'View tracked' });
};

export const getProductRecommendations = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const [frequentlyBoughtTogether, similar, alsoViewed] = await Promise.all([
    recoService.getFrequentlyBoughtTogether(productId, 6),
    recoService.getSimilarProducts(productId, 8),
    recoService.getCustomersAlsoViewed(productId, 8),
  ]);
  sendSuccess(res, { frequentlyBoughtTogether, similar, alsoViewed });
};

export const getUpsell = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const products = await recoService.getUpsellProducts(productId, 4);
  sendSuccess(res, products);
};

export const getCrossSell = async (req: Request, res: Response) => {
  const { productIds } = req.query as { productIds: string };
  if (!productIds) throw new BadRequestError('productIds required');
  const ids = productIds.split(',').filter(Boolean);
  const products = await recoService.getCrossSellForCart(ids, 6);
  sendSuccess(res, products);
};

export const getBanners = async (_req: Request, res: Response) => {
  const banners = await merchandisingService.getActiveBanners();
  sendSuccess(res, banners);
};

// ─── Admin: Rules ────────────────────────────────────────────────────────────

export const adminListRules = async (req: Request, res: Response) => {
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await merchandisingService.listRules({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.rules, result.meta, 'Rules');
};

export const adminCreateRule = async (req: Request, res: Response) => {
  const rule = await merchandisingService.createRule(req.body);
  sendCreated(res, rule, 'Rule created');
};

export const adminUpdateRule = async (req: Request, res: Response) => {
  const rule = await merchandisingService.updateRule(req.params['id'] as string, req.body);
  sendSuccess(res, rule, 'Rule updated');
};

export const adminDeleteRule = async (req: Request, res: Response) => {
  await merchandisingService.deleteRule(req.params['id'] as string);
  sendNoContent(res);
};

export const adminEvaluateRule = async (req: Request, res: Response) => {
  const productIds = await merchandisingService.evaluateRule(req.params['id'] as string);
  sendSuccess(res, { productIds, count: productIds.length }, 'Rule evaluated');
};

// ─── Admin: Banners ──────────────────────────────────────────────────────────

export const adminListBanners = async (_req: Request, res: Response) => {
  const banners = await merchandisingService.listBanners();
  sendSuccess(res, banners);
};

export const adminCreateBanner = async (req: Request, res: Response) => {
  const banner = await merchandisingService.createBanner(req.body);
  sendCreated(res, banner, 'Banner created');
};

export const adminUpdateBanner = async (req: Request, res: Response) => {
  const banner = await merchandisingService.updateBanner(req.params['id'] as string, req.body);
  sendSuccess(res, banner, 'Banner updated');
};

export const adminDeleteBanner = async (req: Request, res: Response) => {
  await merchandisingService.deleteBanner(req.params['id'] as string);
  sendNoContent(res);
};
