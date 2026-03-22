import mongoose, { Document, Schema, Types } from 'mongoose';

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ITicketMessage {
  body: string;
  senderType: 'user' | 'admin';
  senderId: Types.ObjectId;
  timestamp: Date;
}

export interface ITicketDoc extends Document {
  ticketNumber: string;
  userId: Types.ObjectId;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: Types.ObjectId | null;
  messages: ITicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const ticketMessageSchema = new Schema<ITicketMessage>(
  {
    body: { type: String, required: true },
    senderType: { type: String, enum: ['user', 'admin'], required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const ticketSchema = new Schema<ITicketDoc>(
  {
    ticketNumber: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 5000 },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'waiting', 'resolved', 'closed'],
      default: 'open',
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    messages: [ticketMessageSchema],
  },
  { timestamps: true },
);

ticketSchema.index({ ticketNumber: 1 }, { unique: true });
ticketSchema.index({ userId: 1, createdAt: -1 });
ticketSchema.index({ status: 1, priority: -1, createdAt: -1 });
ticketSchema.index({ assignedTo: 1, status: 1 });

export const Ticket = mongoose.model<ITicketDoc>('Ticket', ticketSchema);
