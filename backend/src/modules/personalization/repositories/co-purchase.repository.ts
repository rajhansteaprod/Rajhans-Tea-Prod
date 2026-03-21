import { Types } from 'mongoose';
import { CoPurchase } from '../models/co-purchase.model';
import { Order } from '../../inventory/models/order.model';

export class CoPurchaseRepository {
  async rebuildFromOrders(lookbackDays = 90): Promise<number> {
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const orders = await Order.find({
      status: 'delivered',
      createdAt: { $gte: since },
    })
      .select('items')
      .exec();

    let pairsProcessed = 0;

    for (const order of orders) {
      const productIds = order.items.map((i) => i.productId);
      if (productIds.length < 2) continue;

      // Generate all pairs
      for (let i = 0; i < productIds.length; i++) {
        for (let j = i + 1; j < productIds.length; j++) {
          const [a, b] = [productIds[i], productIds[j]].sort();
          await CoPurchase.findOneAndUpdate(
            { productA: new Types.ObjectId(a), productB: new Types.ObjectId(b) },
            { $inc: { count: 1 }, $set: { lastUpdated: new Date() } },
            { upsert: true },
          ).exec();
          pairsProcessed++;
        }
      }
    }

    return pairsProcessed;
  }

  async getFrequentlyBoughtTogether(productId: string, limit = 6): Promise<string[]> {
    const pid = new Types.ObjectId(productId);
    const results = await CoPurchase.find({
      $or: [{ productA: pid }, { productB: pid }],
    })
      .sort({ count: -1 })
      .limit(limit)
      .exec();

    return results.map((r) => {
      const otherId = r.productA.toString() === productId ? r.productB : r.productA;
      return otherId.toString();
    });
  }

  async getCrossSellProducts(productIds: string[], limit = 6): Promise<string[]> {
    const pids = productIds.map((id) => new Types.ObjectId(id));
    const results = await CoPurchase.find({
      $or: [{ productA: { $in: pids } }, { productB: { $in: pids } }],
    })
      .sort({ count: -1 })
      .limit(limit * 2)
      .exec();

    const seen = new Set(productIds);
    const suggestions: string[] = [];

    for (const r of results) {
      const a = r.productA.toString();
      const b = r.productB.toString();
      const other = seen.has(a) ? b : a;
      if (!seen.has(other)) {
        seen.add(other);
        suggestions.push(other);
        if (suggestions.length >= limit) break;
      }
    }

    return suggestions;
  }
}
