import { Types } from 'mongoose';
import { Invoice, IInvoiceDoc } from '../models/invoice.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class InvoiceRepository {
  async create(data: Partial<IInvoiceDoc>): Promise<IInvoiceDoc> {
    return Invoice.create(data) as Promise<IInvoiceDoc>;
  }

  async findById(id: string): Promise<IInvoiceDoc | null> {
    return Invoice.findById(id).exec();
  }

  async findByPaymentId(paymentId: string): Promise<IInvoiceDoc | null> {
    return Invoice.findOne({ paymentId: new Types.ObjectId(paymentId) }).exec();
  }

  async updatePdfPath(invoiceId: string, pdfPath: string): Promise<void> {
    await Invoice.findByIdAndUpdate(invoiceId, { $set: { pdfPath } }).exec();
  }

  /**
   * Auto-increment invoice number: RJ-YYYY-NNNNNN
   */
  async getNextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RJ-${year}-`;

    const last = await Invoice.findOne({ invoiceNumber: { $regex: `^${prefix}` } })
      .sort({ invoiceNumber: -1 })
      .select('invoiceNumber')
      .exec();

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.invoiceNumber.replace(prefix, ''), 10);
      seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(6, '0')}`;
  }

  async findByUserId(
    userId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<{ invoices: IInvoiceDoc[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const { page, limit, skip } = parsePagination(query);
    const filter = { userId: new Types.ObjectId(userId) };
    const [invoices, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Invoice.countDocuments(filter).exec(),
    ]);
    return { invoices, meta: buildPaginationMeta(page, limit, total) };
  }

  async findAll(
    query: { page?: number; limit?: number } = {},
  ): Promise<{ invoices: IInvoiceDoc[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const { page, limit, skip } = parsePagination(query);
    const [invoices, total] = await Promise.all([
      Invoice.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Invoice.countDocuments().exec(),
    ]);
    return { invoices, meta: buildPaginationMeta(page, limit, total) };
  }
}
