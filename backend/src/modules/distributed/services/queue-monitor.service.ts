import { Queue } from 'bullmq';
import { getBullMQConnectionOpts } from '../../../loaders/bullmq.loader';
import { DeadLetter } from '../models/dead-letter.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

// All queue names in the system
const QUEUE_NAMES = [
  'payment',
  'invoice',
  'wallet',
  'fulfillment',
  'promotions',
  'personalization',
  'reviews',
  'notifications',
];

export class QueueMonitorService {
  private queues: Map<string, Queue> = new Map();

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, { connection: getBullMQConnectionOpts() }));
    }
    return this.queues.get(name)!;
  }

  async getQueueHealth(): Promise<{
    queues: {
      name: string;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    }[];
    totalPending: number;
    totalFailed: number;
  }> {
    const results: {
      name: string;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    }[] = [];
    let totalPending = 0;
    let totalFailed = 0;

    for (const name of QUEUE_NAMES) {
      try {
        const queue = this.getQueue(name);
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );
        const entry = {
          name,
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
        };
        results.push(entry);
        totalPending += entry.waiting + entry.active;
        totalFailed += entry.failed;
      } catch {
        results.push({ name, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
      }
    }

    return { queues: results, totalPending, totalFailed };
  }

  // ─── Dead Letter Queue ────────────────────────────────────────────────────

  async addToDeadLetter(data: {
    queueName: string;
    jobName: string;
    jobData: Record<string, unknown>;
    failedReason: string;
    attemptsMade: number;
    originalJobId: string;
  }): Promise<void> {
    await DeadLetter.create(data);
  }

  async getDeadLetters(query: { page?: number; limit?: number; queueName?: string } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = { resolvedAt: null };
    if (query.queueName) filter.queueName = query.queueName;

    const [items, total] = await Promise.all([
      DeadLetter.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      DeadLetter.countDocuments(filter).exec(),
    ]);
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  async retryDeadLetter(id: string): Promise<boolean> {
    const dl = await DeadLetter.findById(id).exec();
    if (!dl || dl.resolvedAt) return false;

    try {
      const queue = this.getQueue(dl.queueName);
      await queue.add(dl.jobName, dl.jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
      dl.resolvedAt = new Date();
      await dl.save();
      return true;
    } catch {
      return false;
    }
  }

  async resolveDeadLetter(id: string): Promise<void> {
    await DeadLetter.findByIdAndUpdate(id, { $set: { resolvedAt: new Date() } }).exec();
  }

  async getDeadLetterStats() {
    const [unresolved, total, byQueue] = await Promise.all([
      DeadLetter.countDocuments({ resolvedAt: null }).exec(),
      DeadLetter.countDocuments().exec(),
      DeadLetter.aggregate([
        { $match: { resolvedAt: null } },
        { $group: { _id: '$queueName', count: { $sum: 1 } } },
      ]).exec(),
    ]);
    return { unresolved, total, byQueue };
  }
}
