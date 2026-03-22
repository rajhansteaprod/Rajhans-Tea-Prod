import { logger } from '../utils/logger';

/**
 * Simple circuit breaker for external API calls (Razorpay, Shiprocket, MSG91).
 *
 * States: CLOSED (normal) → OPEN (failing, reject calls) → HALF_OPEN (test one call)
 *
 * Usage:
 *   const breaker = new CircuitBreaker('razorpay', { failureThreshold: 5, resetTimeout: 60000 });
 *   const result = await breaker.execute(() => razorpay.orders.create(...));
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold?: number; // failures before opening (default: 5)
  resetTimeout?: number; // ms to wait before half-open (default: 60s)
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.info({ breaker: this.name }, 'Circuit breaker → HALF_OPEN');
      } else {
        throw new Error(`Circuit breaker "${this.name}" is OPEN — service unavailable`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info({ breaker: this.name }, 'Circuit breaker → CLOSED (recovered)');
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn({ breaker: this.name, failures: this.failureCount }, 'Circuit breaker → OPEN');
    }
  }

  getState(): { name: string; state: CircuitState; failures: number } {
    return { name: this.name, state: this.state, failures: this.failureCount };
  }
}

// ─── Pre-configured breakers for external services ──────────────────────────

export const razorpayBreaker = new CircuitBreaker('razorpay', {
  failureThreshold: 5,
  resetTimeout: 60000,
});
export const shiprocketBreaker = new CircuitBreaker('shiprocket', {
  failureThreshold: 3,
  resetTimeout: 120000,
});
export const smsBreaker = new CircuitBreaker('sms', { failureThreshold: 5, resetTimeout: 60000 });
