import { Types } from 'mongoose';
import { QuestionRepository } from '../repositories/question.repository';
import { User } from '../../../models/user.model';
import { NotFoundError } from '../../../utils/api-error';

export class QAService {
  private repo = new QuestionRepository();

  async submitQuestion(userId: string, productId: string, questionText: string) {
    return this.repo.create({
      userId: new Types.ObjectId(userId),
      productId: new Types.ObjectId(productId),
      questionText,
      status: 'approved', // auto-approve questions
    });
  }

  async submitAnswer(userId: string, questionId: string, body: string) {
    const question = await this.repo.findById(questionId);
    if (!question) throw new NotFoundError('Question not found');

    const user = await User.findById(userId).select('role').exec();
    const isAdminAnswer = user?.role === 'admin';

    await this.repo.addAnswer(questionId, { userId, body, isAdminAnswer });
  }

  async getProductQA(productId: string, query: { page?: number; limit?: number } = {}) {
    return this.repo.findByProduct(productId, query);
  }

  async voteQuestion(questionId: string) {
    await this.repo.incrementVoteCount(questionId, 1);
  }

  // Admin
  async getModerationQueue(query: { page?: number; limit?: number } = {}) {
    return this.repo.findModerationQueue(query);
  }

  async approveQuestion(questionId: string) {
    await this.repo.updateStatus(questionId, 'approved');
  }

  async rejectQuestion(questionId: string) {
    await this.repo.updateStatus(questionId, 'rejected');
  }
}
