import { Request, Response } from 'express';
import { HomepageSection } from './models/homepage-section.model';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/api-response';
import { invalidateCache } from '../../middleware/cache-response.middleware';

export const listHomepageSectionsAdmin = async (_req: Request, res: Response) => {
  const sections = await HomepageSection.find()
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
  sendSuccess(res, sections);
};

export const createHomepageSection = async (req: Request, res: Response) => {
  const { title, productIds, sortOrder, isActive } = req.body;
  const section = await HomepageSection.create({
    title,
    productIds: productIds || [],
    sortOrder: sortOrder || 0,
    isActive: isActive !== undefined ? isActive : true,
  });
  await invalidateCache('*');
  sendCreated(res, section, 'Homepage section created successfully');
};

export const updateHomepageSection = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, productIds, sortOrder, isActive } = req.body;
  
  const updateFields: any = {};
  if (title !== undefined) updateFields.title = title;
  if (productIds !== undefined) updateFields.productIds = productIds;
  if (sortOrder !== undefined) updateFields.sortOrder = sortOrder;
  if (isActive !== undefined) updateFields.isActive = isActive;

  const section = await HomepageSection.findByIdAndUpdate(
    id,
    { $set: updateFields },
    { new: true, runValidators: true }
  ).exec();
  
  await invalidateCache('*');
  sendSuccess(res, section, 'Homepage section updated successfully');
};

export const deleteHomepageSection = async (req: Request, res: Response) => {
  const { id } = req.params;
  await HomepageSection.findByIdAndDelete(id).exec();
  await invalidateCache('*');
  sendNoContent(res);
};

export const reorderHomepageSections = async (req: Request, res: Response) => {
  const { sectionIds } = req.body; // Array of IDs in new order
  if (!Array.isArray(sectionIds)) {
    res.status(400).json({ message: 'sectionIds must be an array of IDs' });
    return;
  }

  const bulkOps = sectionIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { sortOrder: index } },
    },
  }));

  if (bulkOps.length > 0) {
    await HomepageSection.bulkWrite(bulkOps);
  }

  await invalidateCache('*');
  sendSuccess(res, null, 'Sections reordered successfully');
};
