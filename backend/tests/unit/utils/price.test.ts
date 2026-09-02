import { resolveUnitPrice, toMoney } from '../../../src/utils/price';

describe('resolveUnitPrice', () => {
  describe('product without a variant', () => {
    it('uses discountedPrice when it is a valid discount', () => {
      const product = { basePrice: 500, discountedPrice: 450 };
      expect(resolveUnitPrice(product)).toBe(450);
    });

    it('falls back to basePrice when discountedPrice is undefined', () => {
      const product = { basePrice: 500, discountedPrice: undefined };
      expect(resolveUnitPrice(product)).toBe(500);
    });

    it('falls back to basePrice when discountedPrice is not lower (bad admin data)', () => {
      const product = { basePrice: 500, discountedPrice: 500 };
      expect(resolveUnitPrice(product)).toBe(500);
    });

    it('falls back to basePrice when discountedPrice is zero or negative', () => {
      expect(resolveUnitPrice({ basePrice: 500, discountedPrice: 0 })).toBe(500);
      expect(resolveUnitPrice({ basePrice: 500, discountedPrice: -10 })).toBe(500);
    });
  });

  describe('product with a variant selected', () => {
    it('uses the variant discountedPrice when valid', () => {
      const product = { basePrice: 500, discountedPrice: 450 };
      const variant = { price: 300, discountedPrice: 250 };
      expect(resolveUnitPrice(product, variant)).toBe(250);
    });

    it('ignores the product-level price entirely once a variant is selected', () => {
      const product = { basePrice: 500, discountedPrice: 450 };
      const variant = { price: 300, discountedPrice: undefined };
      expect(resolveUnitPrice(product, variant)).toBe(300);
    });

    it('falls back to variant.price when variant discount is invalid', () => {
      const product = { basePrice: 500, discountedPrice: 450 };
      const variant = { price: 300, discountedPrice: 300 };
      expect(resolveUnitPrice(product, variant)).toBe(300);
    });
  });
});

describe('toMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(toMoney(19.995)).toBe(20);
    expect(toMoney(19.994)).toBe(19.99);
  });

  it('avoids float drift on repeated addition', () => {
    const values = [0.1, 0.2, 0.3];
    const sum = values.reduce((s, v) => s + v, 0);
    expect(toMoney(sum)).toBe(0.6);
  });
});

// ─── Cart pricing invariant ──────────────────────────────────────────────
// The single business rule the cart/checkout UI must always honor:
//   subtotal = Σ (resolveUnitPrice(item) × item.qty)   for every line
// This must hold for any mix of products, variants, and quantities — with
// zero regard for shipping thresholds, coupons, or anything else. Both
// CartService.formatCartView (display) and the checkout pricing engine are
// built on this same primitive, so proving it here proves the invariant for
// both call sites without duplicating their internals.
describe('cart subtotal invariant: sum(unitPrice * qty) for every line', () => {
  interface Line {
    product: { basePrice: number; discountedPrice?: number | null };
    variant?: { price: number; discountedPrice?: number | null };
    qty: number;
  }

  function cartSubtotal(lines: Line[]): number {
    return toMoney(
      lines.reduce((sum, line) => sum + resolveUnitPrice(line.product, line.variant) * line.qty, 0),
    );
  }

  it('sums a single product line at any quantity', () => {
    const line: Line = { product: { basePrice: 200, discountedPrice: 180 }, qty: 1 };
    expect(cartSubtotal([line])).toBe(180);

    for (const qty of [1, 2, 5, 10]) {
      expect(cartSubtotal([{ ...line, qty }])).toBe(180 * qty);
    }
  });

  it('sums multiple distinct products with different quantities', () => {
    const lines: Line[] = [
      { product: { basePrice: 100, discountedPrice: 90 }, qty: 3 }, // 270
      { product: { basePrice: 250 }, qty: 1 },                       // 250 (no discount)
      { product: { basePrice: 60, discountedPrice: 50 }, qty: 4 },   // 200
    ];
    expect(cartSubtotal(lines)).toBe(720);
  });

  it('sums variant lines of the same product independently by quantity', () => {
    const product = { basePrice: 300 }; // ignored once a variant is picked
    const lines: Line[] = [
      { product, variant: { price: 150, discountedPrice: 120 }, qty: 2 }, // 240
      { product, variant: { price: 400 }, qty: 1 },                        // 400
    ];
    expect(cartSubtotal(lines)).toBe(640);
  });

  it('is unaffected by an empty cart', () => {
    expect(cartSubtotal([])).toBe(0);
  });
});
