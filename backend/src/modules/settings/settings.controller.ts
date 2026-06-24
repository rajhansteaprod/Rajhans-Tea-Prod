import { Request, Response } from 'express';
import { StoreSettings } from './models/store-settings.model';
import { sendSuccess } from '../../utils/api-response';
import { Types } from 'mongoose';
import { invalidateCache } from '../../middleware/cache-response.middleware';

export const getSettings = async (_req: Request, res: Response) => {
  let settings = await StoreSettings.findOne().exec();
  if (!settings) settings = await StoreSettings.create({});
  sendSuccess(res, settings);
};

export const updateSettings = async (req: Request, res: Response) => {
  const settings = await StoreSettings.findOneAndUpdate(
    {},
    { $set: { ...req.body, updatedBy: new Types.ObjectId(req.user!.userId) } },
    { new: true, upsert: true },
  ).exec();
  await invalidateCache('*');
  sendSuccess(res, settings, 'Settings updated');
};


