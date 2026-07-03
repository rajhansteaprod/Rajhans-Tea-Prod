import { Types } from 'mongoose';
import { Product } from '../../catalog/models/product.model';
import { ProductVariant } from '../../catalog/models/product-variant.model';
import { StockMovementRepository } from '../repositories/stock-movement.repository';
import { InventoryAlertRepository } from '../repositories/inventory-alert.repository';
import { WarehouseRepository } from '../repositories/warehouse.repository';
import { OrderRepository } from '../repositories/order.repository';
import { StockReservation } from '../../cart/models/stock-reservation.model';

const LOW_STOCK_THRESHOLD = 5;

export class InventoryService {
  private movementRepo = new StockMovementRepository();
  private alertRepo = new InventoryAlertRepository();
  private warehouseRepo = new WarehouseRepository();
  private orderRepo = new OrderRepository();

  // ─── Stock deduction after order creation ─────────────────────────────────

  async deductStock(orderId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) return;

    const warehouse = await this.warehouseRepo.findDefault();
    if (!warehouse) return;

    for (const item of order.items) {
      // Variant items deduct variant stock; simple items deduct product stock.
      // Atomic $inc guarded by a stock filter — concurrent orders can never
      // drive stock negative or lose updates (read-modify-write eliminated).
      let previousStock: number;
      let newStock: number;

      if (item.variantId) {
        const variant = await ProductVariant.findOneAndUpdate(
          { _id: item.variantId, stock: { $gte: item.qty } },
          { $inc: { stock: -item.qty } },
          { new: true },
        ).exec();

        if (variant) {
          previousStock = variant.stock + item.qty;
          newStock = variant.stock;
        } else {
          // Insufficient stock (oversell slipped through reservations) —
          // clamp to zero and record the discrepancy loudly.
          const drained = await ProductVariant.findByIdAndUpdate(
            item.variantId,
            { $set: { stock: 0 } },
          ).exec();
          if (!drained) continue;
          previousStock = drained.stock;
          newStock = 0;
          console.error(
            `[Inventory] OVERSELL: variant ${item.variantId} had ${drained.stock}, order ${order.orderNumber} needed ${item.qty}`,
          );
        }
      } else {
        const product = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.qty } },
          { $inc: { stock: -item.qty } },
          { new: true },
        ).exec();

        if (product) {
          previousStock = product.stock + item.qty;
          newStock = product.stock;
        } else {
          const drained = await Product.findByIdAndUpdate(
            item.productId,
            { $set: { stock: 0 } },
          ).exec();
          if (!drained) continue;
          previousStock = drained.stock;
          newStock = 0;
          console.error(
            `[Inventory] OVERSELL: product ${item.productId} had ${drained.stock}, order ${order.orderNumber} needed ${item.qty}`,
          );
        }
      }

      await this.movementRepo.create({
        productId: new Types.ObjectId(item.productId),
        warehouseId: warehouse._id,
        type: 'purchase_deduction',
        qty: -(previousStock - newStock),
        previousStock,
        newStock,
        referenceId: orderId,
        referenceType: 'order',
        note: item.variantId
          ? `Order ${order.orderNumber} (variant ${item.variantId})`
          : `Order ${order.orderNumber}`,
      });

      // Check low stock
      if (newStock <= LOW_STOCK_THRESHOLD) {
        const alertType = newStock === 0 ? 'out_of_stock' : 'low_stock';
        await this.alertRepo.upsertAlert(
          item.productId,
          warehouse._id.toString(),
          alertType,
          newStock,
          LOW_STOCK_THRESHOLD,
        );
      }
    }

    // Clear stock reservations for this payment session
    const payment = await import('../../payments/models/payment.model').then((m) =>
      m.Payment.findById(order.paymentId).exec(),
    );
    if (payment) {
      await StockReservation.deleteMany({ sessionId: payment.sessionId }).exec();
    }
  }

  // ─── Manual stock adjustment (admin) ──────────────────────────────────────

  async adjustStock(
    productId: string,
    qty: number,
    note: string,
    adminUserId: string,
  ): Promise<{ previousStock: number; newStock: number }> {
    const product = await Product.findById(productId).exec();
    if (!product) throw new Error('Product not found');

    const warehouse = await this.warehouseRepo.findDefault();
    if (!warehouse) throw new Error('No default warehouse');

    const previousStock = product.stock;
    const newStock = Math.max(0, previousStock + qty);

    await Product.findByIdAndUpdate(productId, { $set: { stock: newStock } }).exec();

    await this.movementRepo.create({
      productId: new Types.ObjectId(productId),
      warehouseId: warehouse._id,
      type: 'manual_adjustment',
      qty,
      previousStock,
      newStock,
      referenceType: 'manual',
      note,
      performedBy: new Types.ObjectId(adminUserId),
    });

    // Resolve alerts if stock is now above threshold
    if (newStock > LOW_STOCK_THRESHOLD) {
      await this.alertRepo.resolveByProduct(productId);
    }

    return { previousStock, newStock };
  }

  // ─── Restock from return ──────────────────────────────────────────────────

  async restockFromReturn(
    orderId: string,
    items: { productId: string; variantId?: string | null; qty: number }[],
  ): Promise<void> {
    const warehouse = await this.warehouseRepo.findDefault();
    if (!warehouse) return;

    for (const item of items) {
      let previousStock: number;
      let newStock: number;

      if (item.variantId) {
        const variant = await ProductVariant.findByIdAndUpdate(
          item.variantId,
          { $inc: { stock: item.qty } },
          { new: true },
        ).exec();
        if (!variant) continue;
        previousStock = variant.stock - item.qty;
        newStock = variant.stock;
      } else {
        const product = await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: item.qty } },
          { new: true },
        ).exec();
        if (!product) continue;
        previousStock = product.stock - item.qty;
        newStock = product.stock;
      }

      await this.movementRepo.create({
        productId: new Types.ObjectId(item.productId),
        warehouseId: warehouse._id,
        type: 'return_restock',
        qty: item.qty,
        previousStock,
        newStock,
        referenceId: orderId,
        referenceType: 'return',
        note: 'Return restock',
      });

      if (newStock > LOW_STOCK_THRESHOLD) {
        await this.alertRepo.resolveByProduct(item.productId);
      }
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getMovementHistory(productId: string, query: { page?: number; limit?: number } = {}) {
    return this.movementRepo.findByProduct(productId, query);
  }

  async getLowStockProducts(threshold = LOW_STOCK_THRESHOLD) {
    return Product.find({ stock: { $lte: threshold }, trackInventory: true })
      .select('name slug images stock basePrice')
      .sort({ stock: 1 })
      .limit(50)
      .exec();
  }

  async getInventoryStats() {
    const [totalProducts, lowStock, outOfStock, unresolvedAlerts] = await Promise.all([
      Product.countDocuments({ trackInventory: true }).exec(),
      Product.countDocuments({
        trackInventory: true,
        stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD },
      }).exec(),
      Product.countDocuments({ trackInventory: true, stock: 0 }).exec(),
      this.alertRepo.findUnresolved({ limit: 100 }),
    ]);

    return { totalProducts, lowStock, outOfStock, alerts: unresolvedAlerts.alerts };
  }

  async getAllTrackedProducts(query: { search?: string; sort?: string } = {}) {
    const filter: Record<string, unknown> = { trackInventory: true };
    if (query.search) {
      filter.name = { $regex: query.search, $options: 'i' };
    }
    const sortField: Record<string, 1> = query.sort === 'stock' ? { stock: 1 } : { name: 1 };
    return Product.find(filter)
      .select('name slug images stock basePrice status')
      .sort(sortField)
      .limit(200)
      .exec();
  }

  async getAllMovements(query: { page?: number; limit?: number; type?: string } = {}) {
    const { parsePagination, buildPaginationMeta } = await import('../../../utils/pagination');
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;

    const { StockMovement } = await import('../models/stock-movement.model');
    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('productId', 'name slug images')
        .populate('performedBy', 'phone firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      StockMovement.countDocuments(filter).exec(),
    ]);
    return { movements, meta: buildPaginationMeta(page, limit, total) };
  }

  async setStock(
    productId: string,
    newStockValue: number,
    note: string,
    adminUserId: string,
  ): Promise<{ previousStock: number; newStock: number }> {
    const product = await Product.findById(productId).exec();
    if (!product) throw new Error('Product not found');

    const warehouse = await this.warehouseRepo.findDefault();
    if (!warehouse) throw new Error('No default warehouse');

    const previousStock = product.stock;
    const diff = newStockValue - previousStock;

    await Product.findByIdAndUpdate(productId, { $set: { stock: newStockValue } }).exec();

    await this.movementRepo.create({
      productId: new Types.ObjectId(productId),
      warehouseId: warehouse._id,
      type: 'manual_adjustment',
      qty: diff,
      previousStock,
      newStock: newStockValue,
      referenceType: 'manual',
      note: `Set stock: ${note}`,
      performedBy: new Types.ObjectId(adminUserId),
    });

    if (newStockValue > LOW_STOCK_THRESHOLD) {
      await this.alertRepo.resolveByProduct(productId);
    } else {
      const alertType = newStockValue === 0 ? 'out_of_stock' : 'low_stock';
      await this.alertRepo.upsertAlert(
        productId,
        warehouse._id.toString(),
        alertType,
        newStockValue,
        LOW_STOCK_THRESHOLD,
      );
    }

    return { previousStock, newStock: newStockValue };
  }

  async resolveAlert(alertId: string): Promise<void> {
    await this.alertRepo.resolve(alertId);
  }

  async getUnresolvedAlerts(query: { page?: number; limit?: number } = {}) {
    return this.alertRepo.findUnresolved(query);
  }
}
