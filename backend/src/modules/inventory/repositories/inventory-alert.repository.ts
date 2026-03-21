import { Types } from 'mongoose';
import { InventoryAlert, IInventoryAlertDoc } from '../models/inventory-alert.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class InventoryAlertRepository {
  async upsertAlert(
    productId: string,
    warehouseId: string,
    type: 'low_stock' | 'out_of_stock',
    currentStock: number,
    threshold: number,
  ): Promise<IInventoryAlertDoc> {
    return InventoryAlert.findOneAndUpdate(
      {
        productId: new Types.ObjectId(productId),
        warehouseId: new Types.ObjectId(warehouseId),
        isResolved: false,
      },
      { $set: { type, currentStock, threshold } },
      { new: true, upsert: true },
    ).exec() as Promise<IInventoryAlertDoc>;
  }

  async resolve(alertId: string): Promise<void> {
    await InventoryAlert.findByIdAndUpdate(alertId, {
      $set: { isResolved: true, resolvedAt: new Date() },
    }).exec();
  }

  async resolveByProduct(productId: string): Promise<void> {
    await InventoryAlert.updateMany(
      { productId: new Types.ObjectId(productId), isResolved: false },
      { $set: { isResolved: true, resolvedAt: new Date() } },
    ).exec();
  }

  async findUnresolved(query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { isResolved: false };
    const [alerts, total] = await Promise.all([
      InventoryAlert.find(filter)
        .populate('productId', 'name slug images stock')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      InventoryAlert.countDocuments(filter).exec(),
    ]);
    return { alerts, meta: buildPaginationMeta(page, limit, total) };
  }
}
