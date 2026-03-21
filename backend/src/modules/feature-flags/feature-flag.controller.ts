import { Request, Response } from 'express';
import { FeatureFlagService } from './services/feature-flag.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/api-response';

const flagService = new FeatureFlagService();

// ─── Public — Evaluate flags for current user ────────────────────────────────

export const evaluateFlags = async (req: Request, res: Response) => {
  const context = {
    userId: req.user?.userId,
    role: req.user?.role,
  };
  const flags = await flagService.evaluateAll(context);
  sendSuccess(res, flags);
};

export const checkFlag = async (req: Request, res: Response) => {
  const slug = req.params['slug'] as string;
  const enabled = await flagService.isEnabled(slug, {
    userId: req.user?.userId,
    role: req.user?.role,
  });
  sendSuccess(res, { slug, enabled });
};

// ─── Admin CRUD ──────────────────────────────────────────────────────────────

export const listFlags = async (_req: Request, res: Response) => {
  const flags = await flagService.listAll();
  sendSuccess(res, flags);
};

export const createFlag = async (req: Request, res: Response) => {
  const flag = await flagService.create(req.body, req.user!.userId);
  sendCreated(res, flag, 'Feature flag created');
};

export const updateFlag = async (req: Request, res: Response) => {
  const flag = await flagService.update(req.params['id'] as string, req.body, req.user!.userId);
  sendSuccess(res, flag, 'Feature flag updated');
};

export const toggleFlag = async (req: Request, res: Response) => {
  const flag = await flagService.toggle(req.params['id'] as string, req.user!.userId);
  sendSuccess(res, flag, 'Feature flag toggled');
};

export const deleteFlag = async (req: Request, res: Response) => {
  await flagService.delete(req.params['id'] as string);
  sendNoContent(res);
};
