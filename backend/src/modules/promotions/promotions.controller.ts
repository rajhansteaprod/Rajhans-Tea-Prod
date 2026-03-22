import { Request, Response } from 'express';
import { CouponService } from './services/coupon.service';
import { LoyaltyService } from './services/loyalty.service';
import { ReferralService } from './services/referral.service';
import { PromotionService } from './services/promotion.service';
import { CampaignRepository } from './repositories/campaign.repository';
import { CheckoutService } from '../cart/services/checkout.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';
import { slugify } from '../../utils/slugify';

const couponService = new CouponService();
const loyaltyService = new LoyaltyService();
const referralService = new ReferralService();
const promotionService = new PromotionService();
const campaignRepo = new CampaignRepository();
const checkoutService = new CheckoutService();

function getSessionId(req: Request): string {
  const sid = req.headers['x-session-id'];
  if (!sid || typeof sid !== 'string') throw new BadRequestError('X-Session-ID required');
  return sid.trim();
}

// ─── Public ──────────────────────────────────────────────────────────────────

export const getActiveCampaigns = async (_req: Request, res: Response) => {
  const campaigns = await campaignRepo.findActive();
  sendSuccess(res, campaigns.map((c) => ({
    _id: c._id,
    name: c.name,
    slug: c.slug,
    type: c.type,
    description: c.description,
    bannerImage: c.bannerImage,
    bannerLink: c.bannerLink,
    endsAt: c.endsAt,
  })));
};

export const validateCoupon = async (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const { code } = req.body as { code: string };
  const userId = req.user?.userId ?? null;
  const summary = await checkoutService.getSummary(sessionId);
  const result = await promotionService.validateCoupon(code, summary, userId);
  sendSuccess(res, result);
};

// ─── Authenticated ───────────────────────────────────────────────────────────

export const getLoyaltyAccount = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const [account, settings, history] = await Promise.all([
    loyaltyService.getAccount(userId),
    loyaltyService.getSettings(),
    loyaltyService.getHistory(userId, { limit: 20 }),
  ]);
  sendSuccess(res, {
    balance: account.balance,
    totalEarned: account.totalEarned,
    totalRedeemed: account.totalRedeemed,
    earnRate: settings.earnRate,
    redeemRate: settings.redeemRate,
    transactions: history.transactions,
  });
};

export const getReferralCode = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const code = await referralService.getOrCreateCode(userId);
  const stats = await referralService.getReferrerStats(userId);
  sendSuccess(res, { code, ...stats });
};

// ─── Admin: Coupons ──────────────────────────────────────────────────────────

export const adminListCoupons = async (req: Request, res: Response) => {
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await couponService.getAll({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.coupons, result.meta, 'Coupons');
};

export const adminCreateCoupon = async (req: Request, res: Response) => {
  const coupon = await couponService.create(req.body, req.user!.userId);
  sendCreated(res, coupon, 'Coupon created');
};

export const adminUpdateCoupon = async (req: Request, res: Response) => {
  const coupon = await couponService.update(req.params['id'] as string, req.body);
  sendSuccess(res, coupon, 'Coupon updated');
};

export const adminDeleteCoupon = async (req: Request, res: Response) => {
  await couponService.delete(req.params['id'] as string);
  sendNoContent(res);
};

// ─── Admin: Campaigns ────────────────────────────────────────────────────────

export const adminListCampaigns = async (req: Request, res: Response) => {
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await campaignRepo.findAll({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.campaigns, result.meta, 'Campaigns');
};

export const adminCreateCampaign = async (req: Request, res: Response) => {
  const data = req.body;
  if (!data.slug) data.slug = slugify(data.name);
  const campaign = await campaignRepo.create(data);
  sendCreated(res, campaign, 'Campaign created');
};

export const adminUpdateCampaign = async (req: Request, res: Response) => {
  const campaign = await campaignRepo.update(req.params['id'] as string, req.body);
  sendSuccess(res, campaign, 'Campaign updated');
};

export const adminDeleteCampaign = async (req: Request, res: Response) => {
  await campaignRepo.delete(req.params['id'] as string);
  sendNoContent(res);
};

// ─── Admin: Loyalty Settings ─────────────────────────────────────────────────

export const adminGetLoyaltySettings = async (_req: Request, res: Response) => {
  const settings = await loyaltyService.getSettings();
  sendSuccess(res, settings);
};

export const adminUpdateLoyaltySettings = async (req: Request, res: Response) => {
  const settings = await loyaltyService.updateSettings(req.body);
  sendSuccess(res, settings, 'Loyalty settings updated');
};

// ─── Admin: Referral Settings ────────────────────────────────────────────────

export const adminGetReferralSettings = async (_req: Request, res: Response) => {
  const settings = await referralService.getSettings();
  sendSuccess(res, settings);
};

export const adminUpdateReferralSettings = async (req: Request, res: Response) => {
  const settings = await referralService.updateSettings(req.body);
  sendSuccess(res, settings, 'Referral settings updated');
};

export const adminListReferrals = async (req: Request, res: Response) => {
  const { page, limit, status } = req.query as Record<string, string | undefined>;
  const result = await referralService.getAllReferrals({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    status,
  });
  sendPaginated(res, result.referrals, result.meta, 'Referrals');
};
