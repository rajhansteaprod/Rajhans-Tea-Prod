/**
 * Single source of truth for resolving the effective unit price of a
 * product/variant pair. Used by CartService (display) and CheckoutService
 * (pricing engine input) so both flows always start from the same number.
 */

export interface PricedProduct {
  basePrice: number;
  discountedPrice?: number | null;
}

export interface PricedVariant {
  price: number;
  discountedPrice?: number | null;
}

/**
 * Effective unit price:
 *  - variant selected  → variant.discountedPrice ?? variant.price
 *  - no variant        → product.discountedPrice ?? product.basePrice
 * A discountedPrice is only honoured when it is a positive number lower
 * than the regular price (defensive against bad admin data).
 */
export function resolveUnitPrice(
  product: PricedProduct,
  variant?: PricedVariant | null,
): number {
  if (variant) {
    const discounted = variant.discountedPrice;
    if (typeof discounted === 'number' && discounted > 0 && discounted < variant.price) {
      return discounted;
    }
    return variant.price;
  }

  const discounted = product.discountedPrice;
  if (typeof discounted === 'number' && discounted > 0 && discounted < product.basePrice) {
    return discounted;
  }
  return product.basePrice;
}

/** Round to 2 decimal places using integer math (avoids float drift). */
export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
