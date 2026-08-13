declare const fbq: ((...args: unknown[]) => void) | undefined;

/**
 * Generates a UUID for a single event occurrence, used as Meta's `eventID`
 * (browser) and, later, the CAPI `event_id`, so the two collapse into one.
 * Falls back to a random string where `crypto.randomUUID` is unavailable.
 */
export function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

/**
 * Fires a Meta Pixel STANDARD event with a controlled `eventID` and returns it,
 * so the same id can later be sent as the CAPI `event_id` for deduplication.
 * Pass an explicit `eventId` for events whose id must be deterministic (e.g.
 * Purchase = order id). No-ops firing the pixel during SSR / when the script is
 * blocked, but still returns an id.
 */
export function trackStandardEvent(
  eventName: string,
  params?: Record<string, unknown>,
  eventId?: string,
): string {
  const id = eventId ?? generateEventId();
  if (typeof fbq !== 'undefined') {
    fbq('track', eventName, params ?? {}, { eventID: id });
  }
  return id;
}

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
