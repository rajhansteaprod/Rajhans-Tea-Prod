import { Request, Response } from 'express';
import { StoreSettings } from './models/store-settings.model';
import { HomepageSection } from './models/homepage-section.model';
import { sendSuccess } from '../../utils/api-response';
import { Types } from 'mongoose';
import { ProductDTO } from '../catalog/dto/product.dto';
import { ProductVariant } from '../catalog/models/product-variant.model';
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

/** Public subset of store settings safe to expose to the storefront. */
export const getPublicSettings = async (_req: Request, res: Response) => {
  let settings = await StoreSettings.findOne().exec();
  if (!settings) settings = await StoreSettings.create({});
  sendSuccess(res, { trustPoints: settings.trustPoints ?? [] });
};

export const getHomepageSectionsPublic = async (_req: Request, res: Response) => {
  const sectionsFromDb = await HomepageSection.find({ isActive: true })
    .populate({
      path: 'productIds',
      model: 'Product',
      populate: [
        { path: 'category' },
        { path: 'collections' }
      ]
    })
    .sort({ sortOrder: 1 })
    .exec();

  const sections = await Promise.all(
    sectionsFromDb.map(async (section) => {
      const populatedProducts = (section.productIds || []) as any[];
      // Filter out inactive / deleted products
      const validProducts = populatedProducts.filter((p) => p && p.status === 'active');

      const productsWithVariants = await Promise.all(
        validProducts.map(async (p) => {
          if (p.hasVariants) {
            const variants = await ProductVariant.find({
              productId: p._id,
              isActive: true,
            })
              .sort({ position: 1 })
              .exec();
            return ProductDTO.toPublic(p, variants);
          }
          return ProductDTO.toPublic(p);
        })
      );

      return {
        title: section.title,
        products: productsWithVariants,
      };
    })
  );

  const filteredSections = sections.filter((sec) => sec.products.length > 0); // Hide empty sections

  sendSuccess(res, filteredSections);
};



