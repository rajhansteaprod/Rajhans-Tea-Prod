import { Types } from 'mongoose';
import { Question, IQuestionDoc } from '../models/question.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class QuestionRepository {
  async create(data: Partial<IQuestionDoc>): Promise<IQuestionDoc> {
    return Question.create(data) as Promise<IQuestionDoc>;
  }

  async findById(id: string): Promise<IQuestionDoc | null> {
    return Question.findById(id)
      .populate('userId', 'phone firstName lastName')
      .populate('answers.userId', 'phone firstName lastName role')
      .exec();
  }

  async findByProduct(productId: string, query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { productId: new Types.ObjectId(productId), status: 'approved' };
    const [questions, total] = await Promise.all([
      Question.find(filter)
        .populate('userId', 'phone firstName lastName')
        .populate('answers.userId', 'phone firstName lastName role')
        .sort({ voteCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Question.countDocuments(filter).exec(),
    ]);
    return { questions, meta: buildPaginationMeta(page, limit, total) };
  }

  async addAnswer(
    questionId: string,
    answer: { userId: string; body: string; isAdminAnswer: boolean },
  ): Promise<void> {
    await Question.findByIdAndUpdate(questionId, {
      $push: {
        answers: {
          userId: new Types.ObjectId(answer.userId),
          body: answer.body,
          isAdminAnswer: answer.isAdminAnswer,
          createdAt: new Date(),
        },
      },
    }).exec();
  }

  async incrementVoteCount(id: string, delta: number): Promise<void> {
    await Question.findByIdAndUpdate(id, { $inc: { voteCount: delta } }).exec();
  }

  async updateStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
    await Question.findByIdAndUpdate(id, { $set: { status } }).exec();
  }

  async findModerationQueue(query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { status: 'pending' };
    const [questions, total] = await Promise.all([
      Question.find(filter)
        .populate('userId', 'phone firstName')
        .populate('productId', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Question.countDocuments(filter).exec(),
    ]);
    return { questions, meta: buildPaginationMeta(page, limit, total) };
  }
}
