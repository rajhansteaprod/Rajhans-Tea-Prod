import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISearchAnalyticsDoc extends Document {
  query: string;
  normalizedQuery: string;
  resultCount: number;
  filters: Record<string, unknown>;
  userId: Types.ObjectId | null;
  sessionId: string | null;
  createdAt: Date;
}

const searchAnalyticsSchema = new Schema<ISearchAnalyticsDoc>(
  {
    query: { type: String, required: true },
    normalizedQuery: { type: String, required: true },
    resultCount: { type: Number, required: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String, default: null },
  },
  { timestamps: true },
);

searchAnalyticsSchema.index({ normalizedQuery: 1, createdAt: -1 });
searchAnalyticsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // 90 days TTL

export const SearchAnalytics = mongoose.model<ISearchAnalyticsDoc>('SearchAnalytics', searchAnalyticsSchema);
