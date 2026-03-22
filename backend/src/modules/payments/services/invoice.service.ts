import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { PaymentRepository } from '../repositories/payment.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { NotFoundError } from '../../../utils/api-error';

const INVOICES_DIR = path.join(process.cwd(), 'uploads', 'invoices');

export class InvoiceService {
  private paymentRepo = new PaymentRepository();
  private invoiceRepo = new InvoiceRepository();

  constructor() {
    // Ensure invoices directory exists
    if (!fs.existsSync(INVOICES_DIR)) {
      fs.mkdirSync(INVOICES_DIR, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // GENERATE INVOICE (called by BullMQ worker after payment capture)
  // ---------------------------------------------------------------------------

  async generateInvoice(paymentId: string): Promise<string> {
    // Already generated? (idempotent)
    const existing = await this.invoiceRepo.findByPaymentId(paymentId);
    if (existing) return existing._id.toString();

    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');

    const invoiceNumber = await this.invoiceRepo.getNextInvoiceNumber();
    const snapshot = payment.checkoutSnapshot;

    // Create invoice document
    const invoice = await this.invoiceRepo.create({
      invoiceNumber,
      paymentId: payment._id,
      userId: payment.userId,
      billingAddress: payment.shippingAddress,
      lineItems: snapshot.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        discount: 0,
        taxRate: snapshot.totalTax > 0 ? 18 : 0, // simplified — uses snapshot tax
        taxAmount: +(snapshot.totalTax / snapshot.items.length).toFixed(2),
        total: item.totalPrice,
      })),
      subtotal: snapshot.subtotal,
      totalDiscount: snapshot.totalDiscount,
      totalTax: snapshot.totalTax,
      grandTotal: snapshot.total,
    });

    // Generate PDF
    const pdfPath = await this.generatePdf(invoice._id.toString(), invoiceNumber, payment);
    await this.invoiceRepo.updatePdfPath(invoice._id.toString(), pdfPath);
    await this.paymentRepo.setInvoiceId(paymentId, invoice._id.toString());

    return invoice._id.toString();
  }

  // ---------------------------------------------------------------------------
  // GET INVOICE
  // ---------------------------------------------------------------------------

  async getByPaymentId(paymentId: string) {
    return this.invoiceRepo.findByPaymentId(paymentId);
  }

  async getById(invoiceId: string) {
    return this.invoiceRepo.findById(invoiceId);
  }

  async getUserInvoices(userId: string, query: { page?: number; limit?: number } = {}) {
    return this.invoiceRepo.findByUserId(userId, query);
  }

  async getAllInvoices(query: { page?: number; limit?: number } = {}) {
    return this.invoiceRepo.findAll(query);
  }

  // ---------------------------------------------------------------------------
  // PDF GENERATION (PDFKit)
  // ---------------------------------------------------------------------------

  private generatePdf(
    _invoiceId: string,
    invoiceNumber: string,
    payment: Awaited<ReturnType<PaymentRepository['findById']>>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!payment) return reject(new Error('Payment not found'));

      const filename = `${invoiceNumber}.pdf`;
      const filePath = path.join(INVOICES_DIR, filename);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      const snapshot = payment.checkoutSnapshot;
      const addr = payment.shippingAddress;

      // ── Header ──────────────────────────────────────────────────
      doc.fontSize(22).font('Helvetica-Bold').text('Rajhans Tea', { align: 'left' });
      doc.fontSize(10).font('Helvetica').text('Tax Invoice / Receipt', { align: 'left' });
      doc.moveDown(0.5);

      doc.fontSize(10).text(`Invoice: ${invoiceNumber}`);
      doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`);
      doc.text(`Payment ID: ${payment.razorpayPaymentId || 'N/A'}`);
      doc.moveDown();

      // ── Shipping Address ────────────────────────────────────────
      doc.font('Helvetica-Bold').text('Ship To:');
      doc.font('Helvetica').text(`${addr.name}`);
      doc.text(`${addr.street}`);
      doc.text(`${addr.city}, ${addr.state} - ${addr.pincode}`);
      doc.text(`Phone: ${addr.phone}`);
      doc.moveDown();

      // ── Items Table ─────────────────────────────────────────────
      const tableTop = doc.y;
      const col = { item: 50, qty: 280, price: 340, total: 440 };

      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Item', col.item, tableTop);
      doc.text('Qty', col.qty, tableTop);
      doc.text('Unit Price', col.price, tableTop);
      doc.text('Total', col.total, tableTop);

      doc
        .moveTo(50, tableTop + 15)
        .lineTo(545, tableTop + 15)
        .stroke();

      let y = tableTop + 25;
      doc.font('Helvetica').fontSize(9);

      for (const item of snapshot.items) {
        doc.text(item.name, col.item, y, { width: 220 });
        doc.text(item.qty.toString(), col.qty, y);
        doc.text(`₹${item.unitPrice.toFixed(2)}`, col.price, y);
        doc.text(`₹${item.totalPrice.toFixed(2)}`, col.total, y);
        y += 20;
      }

      doc.moveTo(50, y).lineTo(545, y).stroke();
      y += 10;

      // ── Totals ──────────────────────────────────────────────────
      doc.font('Helvetica').fontSize(10);
      doc.text(`Subtotal:`, col.price, y);
      doc.text(`₹${snapshot.subtotal.toFixed(2)}`, col.total, y);
      y += 18;

      if (snapshot.totalDiscount > 0) {
        doc.text(`Discount:`, col.price, y);
        doc.text(`-₹${snapshot.totalDiscount.toFixed(2)}`, col.total, y);
        y += 18;
      }

      if (snapshot.totalTax > 0) {
        doc.text(`GST:`, col.price, y);
        doc.text(`₹${snapshot.totalTax.toFixed(2)}`, col.total, y);
        y += 18;
      }

      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`Total:`, col.price, y);
      doc.text(`₹${snapshot.total.toFixed(2)}`, col.total, y);
      y += 30;

      // ── Footer ──────────────────────────────────────────────────
      doc.font('Helvetica').fontSize(8).fillColor('#888');
      doc.text('Thank you for your purchase!', 50, y);
      doc.text(
        'This is a computer-generated invoice and does not require a signature.',
        50,
        y + 12,
      );

      doc.end();

      stream.on('finish', () => resolve(`/uploads/invoices/${filename}`));
      stream.on('error', reject);
    });
  }
}
