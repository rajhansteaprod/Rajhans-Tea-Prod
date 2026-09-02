// =============================================================================
// UNIT TESTS — CheckoutService
// The single pricing authority: per-line rules+tax, order-level coupon applied
// exactly once, variant-aware stock reservation. All dependencies mocked.
// =============================================================================

import { Types } from 'mongoose';

jest.mock('../../../src/modules/cart/repositories/cart.repository');
jest.mock('../../../src/modules/cart/repositories/stock-reservation.repository');
jest.mock('../../../src/modules/cart/repositories/price-snapshot.repository');
jest.mock('../../../src/modules/pricing/services/pricing.service');
jest.mock('../../../src/modules/discounts/services/discount.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../src/modules/catalog/models/product.model', () => ({
  Product: { find: jest.fn() },
}));
jest.mock('../../../src/modules/catalog/models/product-variant.model', () => ({
  ProductVariant: { find: jest.fn() },
}));

import { CheckoutService } from '../../../src/modules/cart/services/checkout.service';
import { StockReservationRepository } from '../../../src/modules/cart/repositories/stock-reservation.repository';
import { PriceSnapshotRepository } from '../../../src/modules/cart/repositories/price-snapshot.repository';
import { PricingService } from '../../../src/modules/pricing/services/pricing.service';
import { DiscountService } from '../../../src/modules/discounts/services/discount.service';
import { Product } from '../../../src/modules/catalog/models/product.model';
import { ProductVariant } from '../../../src/modules/catalog/models/product-variant.model';

const MockedPricing = PricingService as jest.MockedClass<typeof PricingService>;
const MockedDiscount = DiscountService as jest.MockedClass<typeof DiscountService>;
const MockedReservation = StockReservationRepository as jest.MockedClass<typeof StockReservationRepository>;
const MockedSnapshot = PriceSnapshotRepository as jest.MockedClass<typeof PriceSnapshotRepository>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PRODUCT_ID = new Types.ObjectId().toString();
const VARIANT_ID = new Types.ObjectId().toString();
const CATEGORY_ID = new Types.ObjectId();

const activeProduct = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(PRODUCT_ID),
  name: 'Assam Gold',
  slug: 'assam-gold',
  images: ['a.jpg'],
  basePrice: 100,
  discountedPrice: undefined,
  category: CATEGORY_ID,
  collections: [],
  status: 'active',
  stock: 50,
  trackInventory: true,
  ...overrides,
});

const activeVariant = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(VARIANT_ID),
  productId: new Types.ObjectId(PRODUCT_ID),
  name: '250g',
  sku: 'assam-250',
  price: 180,
  discountedPrice: 150,
  stock: 20,
  trackInventory: true,
  isActive: true,
  images: [],
  ...overrides,
});

const mockProductFind = (products: unknown[]) => {
  (Product.find as jest.Mock).mockReturnValue({
    lean: () => ({ exec: () => Promise.resolve(products) }),
  });
};

const mockVariantFind = (variants: unknown[]) => {
  (ProductVariant.find as jest.Mock).mockReturnValue({
    lean: () => ({ exec: () => Promise.resolve(variants) }),
  });
};

// Simple pass-through pricing: no rules, no tax
const passThroughPricing = (pricing: jest.Mocked<PricingService>) => {
  pricing.calculate.mockImplementation(async (input) => {
    const qty = input.qty ?? 1;
    return {
      basePrice: input.basePrice,
      qty,
      appliedRule: null,
      discountPercent: 0,
      discountAmount: 0,
      priceAfterDiscount: input.basePrice,
      taxRate: 0,
      taxAmount: 0,
      isInclusive: true,
      finalPrice: input.basePrice,
      unitPrice: input.basePrice,
      totalPrice: input.basePrice * qty,
      isOnSale: false,
    };
  });
};

describe('CheckoutService.getSummary', () => {
  let service: CheckoutService;
  let pricing: jest.Mocked<PricingService>;
  let discount: jest.Mocked<DiscountService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CheckoutService();
    pricing = MockedPricing.mock.instances[0] as jest.Mocked<PricingService>;
    discount = MockedDiscount.mock.instances[0] as jest.Mocked<DiscountService>;
    passThroughPricing(pricing);
  });

  it('prices items from the live product price — never from client input', async () => {
    mockProductFind([activeProduct()]);

    const summary = await service.getSummary('sess-1', [
      { productId: PRODUCT_ID, qty: 2, basePrice: 1, lineTotal: 2 }, // client lies about price
    ]);

    expect(summary.itemsTotal).toBe(200); // 2 × ₹100 live price
    expect(summary.total).toBe(200);
    expect(pricing.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ basePrice: 100, qty: 2 }),
    );
  });

  it('uses variant discounted price when a variant is selected', async () => {
    mockProductFind([activeProduct()]);
    mockVariantFind([activeVariant()]);

    const summary = await service.getSummary('sess-1', [
      { productId: PRODUCT_ID, variantId: VARIANT_ID, qty: 1 },
    ]);

    expect(pricing.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ basePrice: 150 }), // variant discountedPrice
    );
    expect(summary.items[0].sku).toBe('assam-250');
    expect(summary.items[0].variantId).toBe(VARIANT_ID);
  });

  it('applies a valid coupon exactly ONCE on the order total (not per line)', async () => {
    const secondProductId = new Types.ObjectId().toString();
    mockProductFind([
      activeProduct(),
      activeProduct({ _id: new Types.ObjectId(secondProductId), name: 'Green', slug: 'green', basePrice: 50 }),
    ]);
    discount.validatePromoCode.mockResolvedValue({
      valid: true,
      discountId: new Types.ObjectId().toString(),
      discountAmount: 100,
      message: 'ok',
    });

    const summary = await service.getSummary(
      'sess-1',
      [
        { productId: PRODUCT_ID, qty: 2 }, // 200
        { productId: secondProductId, qty: 2 }, // 100
      ],
      'SAVE100',
    );

    expect(discount.validatePromoCode).toHaveBeenCalledTimes(1);
    expect(discount.validatePromoCode).toHaveBeenCalledWith('SAVE100', 300);
    expect(summary.couponDiscount).toBe(100);
    expect(summary.total).toBe(200); // 300 − 100, once — not once per line
  });

  it('reports promoError and keeps the undiscounted total for invalid coupons', async () => {
    mockProductFind([activeProduct()]);
    discount.validatePromoCode.mockResolvedValue({ valid: false, message: 'This discount has expired' });

    const summary = await service.getSummary('sess-1', [{ productId: PRODUCT_ID, qty: 1 }], 'DEAD');

    expect(summary.promoError).toBe('This discount has expired');
    expect(summary.couponDiscount).toBe(0);
    expect(summary.total).toBe(100);
  });

  it('caps the coupon at the items total (total can never go negative)', async () => {
    mockProductFind([activeProduct({ basePrice: 40 })]);
    discount.validatePromoCode.mockResolvedValue({
      valid: true,
      discountId: new Types.ObjectId().toString(),
      discountAmount: 500,
      message: 'ok',
    });

    const summary = await service.getSummary('sess-1', [{ productId: PRODUCT_ID, qty: 1 }], 'HUGE');

    expect(summary.total).toBe(0);
    expect(summary.couponDiscount).toBe(40);
  });

  it('rejects inactive products', async () => {
    mockProductFind([activeProduct({ status: 'archived' })]);

    await expect(
      service.getSummary('sess-1', [{ productId: PRODUCT_ID, qty: 1 }]),
    ).rejects.toThrow(/no longer available/);
  });

  it('rejects variants that do not belong to the product', async () => {
    const otherProduct = new Types.ObjectId();
    mockProductFind([activeProduct()]);
    mockVariantFind([activeVariant({ productId: otherProduct })]);

    await expect(
      service.getSummary('sess-1', [{ productId: PRODUCT_ID, variantId: VARIANT_ID, qty: 1 }]),
    ).rejects.toThrow(/does not belong/);
  });

  it('merges duplicate lines and clamps quantity to 10', async () => {
    mockProductFind([activeProduct()]);

    const summary = await service.getSummary('sess-1', [
      { productId: PRODUCT_ID, qty: 7 },
      { productId: PRODUCT_ID, qty: 8 },
    ]);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].qty).toBe(10);
  });

  it('rejects malformed quantities', async () => {
    await expect(
      service.getSummary('sess-1', [{ productId: PRODUCT_ID, qty: 1.5 }]),
    ).rejects.toThrow(/positive integer/);
    await expect(
      service.getSummary('sess-1', [{ productId: PRODUCT_ID, qty: -3 }]),
    ).rejects.toThrow(/positive integer/);
  });
});

describe('CheckoutService.freezePrice', () => {
  let service: CheckoutService;
  let pricing: jest.Mocked<PricingService>;
  let discount: jest.Mocked<DiscountService>;
  let snapshotRepo: jest.Mocked<PriceSnapshotRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CheckoutService();
    pricing = MockedPricing.mock.instances[0] as jest.Mocked<PricingService>;
    discount = MockedDiscount.mock.instances[0] as jest.Mocked<DiscountService>;
    snapshotRepo = MockedSnapshot.mock.instances[0] as jest.Mocked<PriceSnapshotRepository>;
    passThroughPricing(pricing);
  });

  it('persists the coupon inside the snapshot so payment charges the displayed total', async () => {
    mockProductFind([activeProduct()]);
    discount.validatePromoCode.mockResolvedValue({
      valid: true,
      discountId: new Types.ObjectId().toString(),
      discountAmount: 30,
      message: 'ok',
    });
    snapshotRepo.create.mockImplementation(async (data: any) => ({
      ...data,
      _id: new Types.ObjectId(),
      expiresAt: data.expiresAt,
    }));

    const frozen = await service.freezePrice('sess-1', [{ productId: PRODUCT_ID, qty: 2 }], 'SAVE30');

    expect(frozen.summary.total).toBe(170); // 200 − 30
    expect(snapshotRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 170,
        couponDiscount: 30,
        couponCode: 'SAVE30',
        currency: 'INR',
      }),
    );
    expect(snapshotRepo.invalidatePreviousActive).toHaveBeenCalledWith('sess-1');
  });

  it('aborts when the requested coupon is invalid — never silently charges full price', async () => {
    mockProductFind([activeProduct()]);
    discount.validatePromoCode.mockResolvedValue({ valid: false, message: 'Invalid promo code' });

    await expect(
      service.freezePrice('sess-1', [{ productId: PRODUCT_ID, qty: 1 }], 'BOGUS'),
    ).rejects.toThrow('Invalid promo code');
    expect(snapshotRepo.create).not.toHaveBeenCalled();
  });
});

describe('CheckoutService.reserveStock', () => {
  let service: CheckoutService;
  let reservationRepo: jest.Mocked<StockReservationRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CheckoutService();
    reservationRepo = MockedReservation.mock.instances[0] as jest.Mocked<StockReservationRepository>;
  });

  it('creates reservations for client-provided items (regression: previously a silent no-op)', async () => {
    mockProductFind([activeProduct({ stock: 10 })]);
    reservationRepo.sumReservedQty.mockResolvedValue(0);
    reservationRepo.reserve.mockResolvedValue({} as never);

    const result = await service.reserveStock('sess-1', [{ productId: PRODUCT_ID, qty: 2 }]);

    expect(result.issues).toHaveLength(0);
    expect(reservationRepo.reserve).toHaveBeenCalledWith('sess-1', PRODUCT_ID, 2, undefined);
  });

  it('reserves variant stock when a variant is selected', async () => {
    mockProductFind([activeProduct()]);
    mockVariantFind([activeVariant({ stock: 5 })]);
    reservationRepo.sumReservedQty.mockResolvedValue(0);
    reservationRepo.reserve.mockResolvedValue({} as never);

    const result = await service.reserveStock('sess-1', [
      { productId: PRODUCT_ID, variantId: VARIANT_ID, qty: 3 },
    ]);

    expect(result.issues).toHaveLength(0);
    expect(reservationRepo.reserve).toHaveBeenCalledWith('sess-1', PRODUCT_ID, 3, VARIANT_ID);
  });

  it('reports an issue instead of reserving when demand exceeds stock', async () => {
    mockProductFind([activeProduct({ stock: 1 })]);
    reservationRepo.sumReservedQty.mockResolvedValue(0);

    const result = await service.reserveStock('sess-1', [{ productId: PRODUCT_ID, qty: 3 }]);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ requested: 3, available: 1 });
    expect(reservationRepo.reserve).not.toHaveBeenCalled();
  });

  it('accounts for other sessions’ active reservations', async () => {
    mockProductFind([activeProduct({ stock: 5 })]);
    reservationRepo.sumReservedQty.mockResolvedValue(4); // someone else holds 4

    const result = await service.reserveStock('sess-1', [{ productId: PRODUCT_ID, qty: 2 }]);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].available).toBe(1);
  });

  it('rolls back its own reservation when a concurrent session wins the race', async () => {
    mockProductFind([activeProduct({ stock: 5 })]);
    // Pre-check: nothing reserved. Post-check (includes own + concurrent): oversubscribed.
    reservationRepo.sumReservedQty
      .mockResolvedValueOnce(0) // pre-check excluding own session
      .mockResolvedValueOnce(8); // post-check: own 4 + concurrent 4 > stock 5
    reservationRepo.reserve.mockResolvedValue({} as never);

    const result = await service.reserveStock('sess-1', [{ productId: PRODUCT_ID, qty: 4 }]);

    expect(result.issues).toHaveLength(1);
    expect(reservationRepo.releaseBySession).toHaveBeenCalledWith('sess-1');
  });

  it('skips reservation entirely for items that do not track inventory', async () => {
    mockProductFind([activeProduct({ trackInventory: false })]);

    const result = await service.reserveStock('sess-1', [{ productId: PRODUCT_ID, qty: 2 }]);

    expect(result.issues).toHaveLength(0);
    expect(reservationRepo.reserve).not.toHaveBeenCalled();
    expect(reservationRepo.sumReservedQty).not.toHaveBeenCalled();
  });

  it('throws on an empty cart', async () => {
    await expect(service.reserveStock('sess-1', [])).rejects.toThrow('Cart is empty');
  });
});

describe('price utility', () => {
  const { resolveUnitPrice, toMoney } = jest.requireActual('../../../src/utils/price');

  it('prefers variant discounted price over everything else', () => {
    expect(resolveUnitPrice({ basePrice: 100, discountedPrice: 80 }, { price: 180, discountedPrice: 150 })).toBe(150);
  });

  it('falls back to variant price when variant discount is invalid', () => {
    expect(resolveUnitPrice({ basePrice: 100 }, { price: 180, discountedPrice: 999 })).toBe(180);
    expect(resolveUnitPrice({ basePrice: 100 }, { price: 180, discountedPrice: 0 })).toBe(180);
  });

  it('uses product discounted price only when it is a real discount', () => {
    expect(resolveUnitPrice({ basePrice: 100, discountedPrice: 80 })).toBe(80);
    expect(resolveUnitPrice({ basePrice: 100, discountedPrice: 120 })).toBe(100);
    expect(resolveUnitPrice({ basePrice: 100 })).toBe(100);
  });

  it('rounds money to 2 decimal places without float drift', () => {
    expect(toMoney(0.1 + 0.2)).toBe(0.3);
    expect(toMoney(99.999)).toBe(100);
  });
});
