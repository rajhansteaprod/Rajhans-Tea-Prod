import crypto from 'crypto';
import { Types } from 'mongoose';
import { FeatureFlag, IFeatureFlagDoc } from '../models/feature-flag.model';
import { getRedisClient } from '../../../loaders/redis.loader';
import { config } from '../../../config';
import { NotFoundError } from '../../../utils/api-error';
import { slugify } from '../../../utils/slugify';
import { logger } from '../../../utils/logger';

const CACHE_TTL = 300; // 5 min cache
const CACHE_PREFIX = 'ff:';

export class FeatureFlagService {
  // ─── Evaluation ───────────────────────────────────────────────────────────

  /**
   * Check if a feature flag is enabled for a given context.
   *
   * Logic:
   * 1. Flag must be enabled
   * 2. Environment must match (or be 'all')
   * 3. If targetUserIds set → user must be in list
   * 4. If targetRoles set → user's role must match
   * 5. Percentage rollout: hash(userId + flagSlug) % 100 < rolloutPercent
   */
  async isEnabled(
    flagSlug: string,
    context: { userId?: string; role?: string } = {},
  ): Promise<boolean> {
    try {
      const flag = await this.getFlagBySlug(flagSlug);
      if (!flag) return false;
      if (!flag.enabled) return false;

      // Environment check
      if (flag.environment !== 'all' && flag.environment !== config.env) return false;

      // User targeting
      if (flag.targetUserIds.length > 0 && context.userId) {
        const isTargeted = flag.targetUserIds.some((id) => id.toString() === context.userId);
        if (!isTargeted) return false;
      }

      // Role targeting
      if (flag.targetRoles.length > 0 && context.role) {
        if (!flag.targetRoles.includes(context.role)) return false;
      }

      // Percentage rollout
      if (flag.rolloutPercent < 100) {
        const hash = crypto
          .createHash('md5')
          .update(`${context.userId || 'anon'}:${flagSlug}`)
          .digest('hex');
        const bucket = parseInt(hash.slice(0, 8), 16) % 100;
        return bucket < flag.rolloutPercent;
      }

      return true;
    } catch (err: any) {
      logger.warn(
        { flagSlug, err: err.message },
        'Feature flag evaluation failed — defaulting to false',
      );
      return false;
    }
  }

  /**
   * Evaluate all flags for a user (returns map of slug → boolean).
   * Useful for frontend to batch-fetch all flags on login.
   */
  async evaluateAll(
    context: { userId?: string; role?: string } = {},
  ): Promise<Record<string, boolean>> {
    const flags = await this.listAll();
    const result: Record<string, boolean> = {};
    for (const flag of flags) {
      result[flag.slug] = await this.isEnabled(flag.slug, context);
    }
    return result;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(data: Partial<IFeatureFlagDoc>, adminUserId: string): Promise<IFeatureFlagDoc> {
    if (!data.slug && data.name) data.slug = slugify(data.name);
    data.updatedBy = new Types.ObjectId(adminUserId);
    const flag = await FeatureFlag.create(data);
    await this.clearCache();
    return flag as IFeatureFlagDoc;
  }

  async update(
    id: string,
    data: Partial<IFeatureFlagDoc>,
    adminUserId: string,
  ): Promise<IFeatureFlagDoc | null> {
    const flag = await FeatureFlag.findById(id).exec();
    if (!flag) throw new NotFoundError('Feature flag not found');
    data.updatedBy = new Types.ObjectId(adminUserId);
    const updated = await FeatureFlag.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    await this.clearCache();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await FeatureFlag.findByIdAndDelete(id).exec();
    await this.clearCache();
  }

  async toggle(id: string, adminUserId: string): Promise<IFeatureFlagDoc | null> {
    const flag = await FeatureFlag.findById(id).exec();
    if (!flag) throw new NotFoundError('Feature flag not found');
    const updated = await FeatureFlag.findByIdAndUpdate(
      id,
      { $set: { enabled: !flag.enabled, updatedBy: new Types.ObjectId(adminUserId) } },
      { new: true },
    ).exec();
    await this.clearCache();
    return updated;
  }

  async listAll(): Promise<IFeatureFlagDoc[]> {
    return FeatureFlag.find().sort({ name: 1 }).exec();
  }

  async getById(id: string): Promise<IFeatureFlagDoc | null> {
    return FeatureFlag.findById(id).exec();
  }

  // ─── Cache ────────────────────────────────────────────────────────────────

  private async getFlagBySlug(slug: string): Promise<IFeatureFlagDoc | null> {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(`${CACHE_PREFIX}${slug}`);
      if (cached) return JSON.parse(cached);
    } catch {
      /* cache miss */
    }

    const flag = await FeatureFlag.findOne({ slug }).lean().exec();
    if (flag) {
      try {
        await getRedisClient().set(`${CACHE_PREFIX}${slug}`, JSON.stringify(flag), 'EX', CACHE_TTL);
      } catch {
        /* silent */
      }
    }
    return flag as IFeatureFlagDoc | null;
  }

  private async clearCache(): Promise<void> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${CACHE_PREFIX}*`);
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      /* silent */
    }
  }
}
