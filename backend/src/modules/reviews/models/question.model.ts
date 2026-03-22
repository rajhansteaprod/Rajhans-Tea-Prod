import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAnswerSubdoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  body: string;
  isAdminAnswer: boolean;
  createdAt: Date;
}

export interface IQuestionDoc extends Document {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  questionText: string;
  status: 'pending' | 'approved' | 'rejected';
  voteCount: number;
  answers: IAnswerSubdoc[];
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<IAnswerSubdoc>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, maxlength: 5000 },
  isAdminAnswer: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date() },
});

const questionSchema = new Schema<IQuestionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    questionText: { type: String, required: true, maxlength: 1000 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
    voteCount: { type: Number, default: 0 },
    answers: [answerSchema],
  },
  { timestamps: true },
);

questionSchema.index({ productId: 1, status: 1, voteCount: -1 });

export const Question = mongoose.model<IQuestionDoc>('Question', questionSchema);
