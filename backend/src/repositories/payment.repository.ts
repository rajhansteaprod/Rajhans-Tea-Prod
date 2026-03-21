import { Types } from 'mongoose';
import { Payment, IPaymentDoc, PaymentStatus } from '../models/payment.model';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';

export class PaymentRepository {
  async create(data: Partial<IPaymentDoc>): Promise<IPaymentDoc> {
    return Payment.create(data) as Promise<IPaymentDoc>;
  }

  async findById(id: string): Promise<IPaymentDoc | null> {
    return Payment.findById(id).exec();
  }

  async findByRazorpayOrderId(orderId: string): Promise<IPaymentDoc | null> {
    return Payment.findOne({ razorpayOrderId: orderId }).exec();
  }

  async findByRazorpayPaymentId(paymentId: string): Promise<IPaymentDoc | null> {
    return Payment.findOne({ razorpayPaymentId: paymentId }).exec();
  }

  async findByIdempotencyKey(key: string): Promise<IPaymentDoc | null> {
    return Payment.findOne({ idempotencyKey: key }).exec();
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    extra: { razorpayPaymentId?: string; razorpaySignature?: string } = {},
  ): Promise<IPaymentDoc | null> {
    const update: Record<string, unknown> = { status };
    if (extra.razorpayPaymentId) update.razorpayPaymentId = extra.razorpayPaymentId;
    if (extra.razorpaySignature) update.razorpaySignature = extra.razorpaySignature;
    return Payment.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
  }

  async addRefund(
    id: string,
    refund: { razorpayRefundId: string; amount: number; reason: string },
  ): Promise<IPaymentDoc | null> {
    return Payment.findByIdAndUpdate(
      id,
      {
        $push: { refunds: { ...refund, createdAt: new Date() } },
        $inc: { refundedAmount: refund.amount },
      },
      { new: true },
    ).exec();
  }

  async setInvoiceId(paymentId: string, invoiceId: string): Promise<void> {
    await Payment.findByIdAndUpdate(paymentId, {
      $set: { invoiceId: new Types.ObjectId(invoiceId) },
    }).exec();
  }

  async findByUserId(
    userId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<{ payments: IPaymentDoc[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const { page, limit, skip } = parsePagination(query);
    // Only show completed orders (not abandoned/created ones)
    const filter = {
      userId: new Types.ObjectId(userId),
      status: { $in: ['captured', 'refunded', 'partially_refunded'] },
    };
    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Payment.countDocuments(filter).exec(),
    ]);
    return { payments, meta: buildPaginationMeta(page, limit, total) };
  }
}
