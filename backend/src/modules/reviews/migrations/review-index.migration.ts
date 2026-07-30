import { Review } from '../models/review.model';
import { logger } from '../../../utils/logger';

/**
 * The Review collection historically had a plain unique index on
 * { userId: 1, productId: 1 }. Anonymous order-token reviews carry no userId,
 * so that non-partial index would reject every second null-userId review with a
 * duplicate-key error. Mongo never recreates an index whose options changed, so
 * we must drop the legacy index explicitly and let syncIndexes() rebuild the
 * partial versions declared on the schema.
 */
export async function migrateReviewIndexes(): Promise<void> {
  try {
    const collection = Review.collection;
    const indexes = await collection.indexes();

    const legacy = indexes.find(
      (idx) =>
        idx.name === 'userId_1_productId_1' &&
        !('partialFilterExpression' in idx),
    );

    if (legacy) {
      await collection.dropIndex('userId_1_productId_1');
      logger.info('Dropped legacy non-partial Review index userId_1_productId_1');
    }

    // Rebuild indexes to match the schema (creates the partial userId/orderId
    // unique indexes). Safe: every index in the collection is schema-declared.
    await Review.syncIndexes();
  } catch (error) {
    // Never block startup on index maintenance — log and continue.
    logger.error({ error }, 'Review index migration failed');
  }
}
