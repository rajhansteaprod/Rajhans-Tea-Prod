import { logger } from '../utils/logger';

const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
]);

const TRANSIENT_MESSAGES = [
  'not primary',
  'not master',
  'node is recovering',
  'socket disconnected',
  'connection timed out',
  'MongoNetworkError',
  'MongoServerSelectionError',
];

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const error = err as Record<string, unknown>;

  // Check error code
  if (typeof error.code === 'string' && TRANSIENT_CODES.has(error.code)) return true;

  // Check error message
  const message = String(error.message || '').toLowerCase();
  return TRANSIENT_MESSAGES.some((m) => message.includes(m.toLowerCase()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a database operation on transient errors.
 *
 * Usage:
 *   const user = await withRetry(() => User.findById(id).exec());
 *   const order = await withRetry(() => Order.create(data), 5, 1000);
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientError(err) || attempt === maxRetries) {
        throw err;
      }
      const delay = baseDelayMs * (attempt + 1);
      logger.warn(
        { attempt: attempt + 1, maxRetries, delay, err: (err as Error).message },
        'Transient DB error — retrying',
      );
      await sleep(delay);
    }
  }
  // Should never reach here, but TypeScript needs it
  throw new Error('Retry exhausted');
}
