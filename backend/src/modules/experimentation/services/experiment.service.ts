import crypto from 'crypto';
import { Types } from 'mongoose';
import { Experiment, IExperimentDoc } from '../models/experiment.model';
import { ExperimentExposure } from '../models/experiment-exposure.model';
import { Payment } from '../../../models/payment.model';
import { NotFoundError, BadRequestError } from '../../../utils/api-error';
import { slugify } from '../../../utils/slugify';

export class ExperimentService {
  // ─── Variant Assignment (deterministic hash) ──────────────────────────────

  async assignVariant(
    experimentSlug: string,
    context: { userId?: string; sessionId: string },
  ): Promise<{ variant: string; experiment: string } | null> {
    const exp = await Experiment.findOne({ slug: experimentSlug, status: 'running' }).exec();
    if (!exp) return null;
    if (exp.variants.length === 0) return null;

    // Deterministic bucket: hash(userId/sessionId + slug) → variant
    const identifier = context.userId || context.sessionId;
    const hash = crypto.createHash('md5').update(`${identifier}:${experimentSlug}`).digest('hex');
    const bucket = parseInt(hash.slice(0, 8), 16) % 100;

    let cumulative = 0;
    let assignedVariant = exp.variants[0].key;
    for (const v of exp.variants) {
      cumulative += v.weight;
      if (bucket < cumulative) {
        assignedVariant = v.key;
        break;
      }
    }

    // Log exposure (fire-and-forget)
    ExperimentExposure.create({
      experimentSlug,
      userId: context.userId ? new Types.ObjectId(context.userId) : null,
      sessionId: context.sessionId,
      variant: assignedVariant,
    }).catch(() => {/* silent */});

    return { variant: assignedVariant, experiment: experimentSlug };
  }

  /**
   * Get all running experiments + assigned variants for a user.
   */
  async getActiveExperiments(context: { userId?: string; sessionId: string }): Promise<Record<string, string>> {
    const running = await Experiment.find({ status: 'running' }).exec();
    const assignments: Record<string, string> = {};

    for (const exp of running) {
      const result = await this.assignVariant(exp.slug, context);
      if (result) assignments[result.experiment] = result.variant;
    }

    return assignments;
  }

  // ─── Results ──────────────────────────────────────────────────────────────

  async getResults(experimentSlug: string): Promise<{
    experiment: IExperimentDoc;
    variants: { key: string; exposures: number; conversions: number; conversionRate: number; revenue: number }[];
  }> {
    const exp = await Experiment.findOne({ slug: experimentSlug }).exec();
    if (!exp) throw new NotFoundError('Experiment not found');

    const variantResults = [];

    for (const v of exp.variants) {
      // Count exposures
      const exposures = await ExperimentExposure.countDocuments({
        experimentSlug,
        variant: v.key,
      }).exec();

      // Get unique userIds/sessionIds for this variant
      const exposedSessions = await ExperimentExposure.distinct('sessionId', {
        experimentSlug,
        variant: v.key,
      }).exec();

      // Count conversions (payments captured by these sessions)
      const conversions = await Payment.countDocuments({
        sessionId: { $in: exposedSessions },
        status: 'captured',
        createdAt: { $gte: exp.startDate || new Date(0) },
      }).exec();

      // Revenue from these sessions
      const revenueAgg = await Payment.aggregate([
        { $match: { sessionId: { $in: exposedSessions }, status: 'captured', createdAt: { $gte: exp.startDate || new Date(0) } } },
        { $group: { _id: null, total: { $sum: '$amountPaise' } } },
      ]).exec();

      const revenue = (revenueAgg[0]?.total ?? 0) / 100;
      const conversionRate = exposures > 0 ? +((conversions / exposures) * 100).toFixed(2) : 0;

      variantResults.push({ key: v.key, exposures, conversions, conversionRate, revenue: +revenue.toFixed(2) });
    }

    return { experiment: exp, variants: variantResults };
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(data: Partial<IExperimentDoc>) {
    if (!data.slug && data.name) data.slug = slugify(data.name);
    // Validate weights sum to 100
    const totalWeight = (data.variants || []).reduce((s, v) => s + v.weight, 0);
    if (data.variants && data.variants.length > 0 && totalWeight !== 100) {
      throw new BadRequestError('Variant weights must sum to 100');
    }
    return Experiment.create(data);
  }

  async update(id: string, data: Partial<IExperimentDoc>) {
    if (data.variants) {
      const totalWeight = data.variants.reduce((s, v) => s + v.weight, 0);
      if (totalWeight !== 100) throw new BadRequestError('Variant weights must sum to 100');
    }
    const exp = await Experiment.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    if (!exp) throw new NotFoundError('Experiment not found');
    return exp;
  }

  async delete(id: string) {
    await Experiment.findByIdAndDelete(id).exec();
  }

  async listAll() {
    return Experiment.find().sort({ createdAt: -1 }).exec();
  }

  async start(id: string) {
    const exp = await Experiment.findById(id).exec();
    if (!exp) throw new NotFoundError('Experiment not found');
    if (exp.variants.length < 2) throw new BadRequestError('Need at least 2 variants');
    exp.status = 'running';
    exp.startDate = new Date();
    return exp.save();
  }

  async stop(id: string) {
    const exp = await Experiment.findById(id).exec();
    if (!exp) throw new NotFoundError('Experiment not found');
    exp.status = 'completed';
    exp.endDate = new Date();
    return exp.save();
  }
}
