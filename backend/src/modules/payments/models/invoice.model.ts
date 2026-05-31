import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IInvoiceLineItem {
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface IInvoiceDoc extends Document {
  invoiceNumber: string;
  paymentId: Types.ObjectId;
  userId: Types.ObjectId | null;
  billingAddress: {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pinCode: string;
  };
  lineItems: IInvoiceLineItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  pdfPath: string | null;
  createdAt: Date;
}

const lineItemSchema = new Schema<IInvoiceLineItem>(
  {
    name: { type: String, required: true },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const invoiceSchema = new Schema<IInvoiceDoc>(
  {
    invoiceNumber: { type: String, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    billingAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pinCode: { type: String, required: true },
    },
    lineItems: [lineItemSchema],
    subtotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    pdfPath: { type: String, default: null },
  },
  { timestamps: true },
);

invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ paymentId: 1 }, { unique: true });
invoiceSchema.index({ userId: 1, createdAt: -1 });

export const Invoice = mongoose.model<IInvoiceDoc>('Invoice', invoiceSchema);
