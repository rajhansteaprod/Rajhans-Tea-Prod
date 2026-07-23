declare const fbq: ((...args: unknown[]) => void) | undefined;

/**
 * Fires a Meta Pixel STANDARD event (ViewContent, AddToCart, AddPaymentInfo,
 * Purchase, etc.) if the pixel script (loaded in index.html) is present.
 *
 * Pass `options.eventID` to enable Meta's event deduplication — e.g. so a
 * Purchase fired once per order is only counted once even if the user refreshes
 * the confirmation page (and, later, so a client Pixel event and a server
 * Conversions API event for the same order collapse into one).
 *
 * No-ops during SSR/prerendering (no `fbq` in that context) and if an
 * ad-blocker stripped the script.
 */
export function trackPixelEvent(
  eventName: string,
  params?: Record<string, unknown>,
  options?: { eventID?: string },
): void {
  if (typeof fbq === 'undefined') return;
  if (params && options) {
    fbq('track', eventName, params, options);
  } else if (params) {
    fbq('track', eventName, params);
  } else {
    fbq('track', eventName);
  }
}

/**
 * Fires a Meta Pixel CUSTOM event (non-standard names such as `AddShippingInfo`
 * or `PaymentCancelled`, which have no Meta standard-event equivalent). Same
 * no-op guards as {@link trackPixelEvent}.
 */
export function trackPixelCustomEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof fbq === 'undefined') return;
  if (params) {
    fbq('trackCustom', eventName, params);
  } else {
    fbq('trackCustom', eventName);
  }
}
