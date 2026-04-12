import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsletterDocument = Newsletter & Document;

@Schema({
  timestamps: { createdAt: true, updatedAt: true },
  collection: 'newsletters',
})
export class Newsletter {
  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    index: true,
  })
  email: string;

  @Prop({
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
    index: true,
  })
  status: string;

  @Prop({
    type: Date,
    default: () => new Date(),
    index: true,
  })
  subscribedAt: Date;

  @Prop({
    type: Date,
    default: null,
  })
  unsubscribedAt: Date | null;

  @Prop({
    type: String,
    default: null,
  })
  unsubscribeReason?: string;

  // Timestamps added by NestJS (createdAt, updatedAt)
  createdAt?: Date;
  updatedAt?: Date;
}

export const NewsletterSchema = SchemaFactory.createForClass(Newsletter);

// Create compound index for queries
NewsletterSchema.index({ status: 1, subscribedAt: -1 });
NewsletterSchema.index({ email: 1, status: 1 });
