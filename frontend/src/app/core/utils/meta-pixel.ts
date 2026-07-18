declare const fbq: ((...args: unknown[]) => void) | undefined;

/**
 * Fires a Meta Pixel event if the pixel script (loaded in index.html) is
 * present. No-ops during SSR/prerendering (no `fbq` in that context) and if
 * an ad-blocker stripped the script.
 */
export function trackPixelEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof fbq === 'undefined') return;
  if (params) {
    fbq('track', eventName, params);
  } else {
    fbq('track', eventName);
  }
}
