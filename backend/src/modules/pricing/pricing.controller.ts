import { Request, Response } from 'express';
import { PricingService } from './services/pricing.service';
import { sendSuccess, sendCreated } from '../../utils/api-response';

const pricingService = new PricingService();

// ─── Calculate ────────────────────────────────────────────────────────────────

export const calculatePrice = async (req: Request, res: Response) => {
  const { productId, basePrice, categoryId, collectionIds, qty } = req.body;
  const breakdown = await pricingService.calculate({
    productId,
    basePrice,
    categoryId,
    collectionIds,
    qty,
  });
  sendSuccess(res, breakdown);
};

// ─── Price Rules ──────────────────────────────────────────────────────────────

export const listPriceRules = async (_req: Request, res: Response) => {
  const rules = await pricingService.listRules();
  sendSuccess(res, rules);
};

export const getPriceRule = async (req: Request, res: Response) => {
  const rule = await pricingService.getRuleById(req.params['id'] as string);
  sendSuccess(res, rule);
};

export const createPriceRule = async (req: Request, res: Response) => {
  const rule = await pricingService.createRule(req.body);
  sendCreated(res, rule, 'Price rule created');
};

export const updatePriceRule = async (req: Request, res: Response) => {
  const rule = await pricingService.updateRule(req.params['id'] as string, req.body);
  sendSuccess(res, rule, 'Price rule updated');
};

export const deletePriceRule = async (req: Request, res: Response) => {
  await pricingService.deleteRule(req.params['id'] as string);
  sendSuccess(res, null, 'Price rule deleted');
};

// ─── Tax Rules ────────────────────────────────────────────────────────────────

export const listTaxRules = async (_req: Request, res: Response) => {
  const rules = await pricingService.listTaxRules();
  sendSuccess(res, rules);
};

export const getTaxRule = async (req: Request, res: Response) => {
  const rule = await pricingService.getTaxRuleById(req.params['id'] as string);
  sendSuccess(res, rule);
};

export const createTaxRule = async (req: Request, res: Response) => {
  const rule = await pricingService.createTaxRule(req.body);
  sendCreated(res, rule, 'Tax rule created');
};

export const updateTaxRule = async (req: Request, res: Response) => {
  const rule = await pricingService.updateTaxRule(req.params['id'] as string, req.body);
  sendSuccess(res, rule, 'Tax rule updated');
};

export const deleteTaxRule = async (req: Request, res: Response) => {
  await pricingService.deleteTaxRule(req.params['id'] as string);
  sendSuccess(res, null, 'Tax rule deleted');
};
