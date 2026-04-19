import { Types } from 'mongoose';
import {
  Order,
  IOrderDoc,
  OrderStatus,
  IStatusHistoryEntry,
  IShiprocketInfo,
} from '../models/order.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class OrderRepository {
  async create(data: Partial<IOrderDoc>): Promise<IOrderDoc> {
    return Order.create(data) as Promise<IOrderDoc>;
  }

  async findById(id: string): Promise<IOrderDoc | null> {
    return Order.findById(id).populate('userId', 'email phone firstName lastName').exec();
  }

  async findByOrderNumber(orderNumber: string): Promise<IOrderDoc | null> {
    return Order.findOne({ orderNumber }).exec();
  }

  async findByPaymentId(paymentId: string): Promise<IOrderDoc | null> {
    return Order.findOne({ paymentId: new Types.ObjectId(paymentId) }).exec();
  }

  async findByUserId(
    userId: string,
    query: { page?: number; limit?: number; status?: string } = {},
  ) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (query.status) filter.status = query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Order.countDocuments(filter).exec(),
    ]);
    return { orders, meta: buildPaginationMeta(page, limit, total) };
  }

  async findAllAdmin(
    query: { page?: number; limit?: number; status?: string; search?: string } = {},
  ) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { orderNumber: { $regex: query.search, $options: 'i' } },
        { 'shippingAddress.name': { $regex: query.search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: query.search, $options: 'i' } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('userId', 'phone firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Order.countDocuments(filter).exec(),
    ]);
    return { orders, meta: buildPaginationMeta(page, limit, total) };
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    historyEntry: IStatusHistoryEntry,
    extra: Record<string, unknown> = {},
  ): Promise<IOrderDoc | null> {
    return Order.findByIdAndUpdate(
      id,
      { $set: { status, ...extra }, $push: { statusHistory: historyEntry } },
      { new: true },
    ).exec();
  }

  async updateShiprocketInfo(id: string, info: Partial<IShiprocketInfo>): Promise<void> {
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(info)) {
      update[`shiprocket.${key}`] = value;
    }
    await Order.findByIdAndUpdate(id, { $set: update }).exec();
  }

  async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ORD-${year}-`;
    const last = await Order.findOne({ orderNumber: { $regex: `^${prefix}` } })
      .sort({ orderNumber: -1 })
      .select('orderNumber')
      .exec();

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.orderNumber.replace(prefix, ''), 10);
      seq = lastSeq + 1;
    }
    return `${prefix}${seq.toString().padStart(5, '0')}`;
  }

  async getOrderStats(): Promise<{
    total: number;
    confirmed: number;
    processing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  }> {
    const result = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();

    const counts: Record<string, number> = {};
    for (const r of result) counts[r._id] = r.count;

    return {
      total: Object.values(counts).reduce((s, c) => s + c, 0),
      confirmed: counts['confirmed'] ?? 0,
      processing: counts['processing'] ?? 0,
      shipped:
        (counts['shipped'] ?? 0) + (counts['in_transit'] ?? 0) + (counts['out_for_delivery'] ?? 0),
      delivered: counts['delivered'] ?? 0,
      cancelled: counts['cancelled'] ?? 0,
    };
  }

  async findActiveShipments(): Promise<IOrderDoc[]> {
    return Order.find({
      status: { $in: ['shipped', 'in_transit', 'out_for_delivery'] },
      'shiprocket.shipmentId': { $ne: null },
    }).exec();
  }
}
