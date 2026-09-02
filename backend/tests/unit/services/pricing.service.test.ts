// =============================================================================
// UNIT TESTS — PricingService
// Deterministic pricing: rules → tax → totals. All repositories mocked.
// =============================================================================

import { PricingService } from '../../../src/modules/pricing/services/pricing.service';
import { PricingRepository } from '../../../src/modules/pricing/repositories/pricing.repository';
import { DiscountService } from '../../../src/modules/discounts/services/discount.service';

jest.mock('../../../src/modules/pricing/repositories/pricing.repository');
jest.mock('../../../src/modules/discounts/services/discount.service');

const MockedRepo = PricingRepository as jest.MockedClass<typeof PricingRepository>;
const MockedDiscountService = DiscountService as jest.MockedClass<typeof DiscountService>;

describe('PricingService.calculate', () => {
  let service: PricingService;
  let repo: jest.Mocked<PricingRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PricingService();
    repo = MockedRepo.mock.instances[0] as jest.Mocked<PricingRepository>;
  });

  const noRules = () => repo.findActiveRulesForProduct.mockResolvedValue([]);
  const noTax = () => repo.findTaxRuleForCategory.mockResolvedValue(null);

  it('returns base price unchanged when no rules or tax apply', async () => {
    noRules();
    noTax();

    const result = await service.calculate({ productId: 'p1', basePrice: 100, qty: 1 });

    expect(result.unitPrice).toBe(100);
    expect(result.totalPrice).toBe(100);
    expect(result.discountAmount).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.isOnSale).toBe(false);
  });

  it('multiplies by quantity deterministically', async () => {
    noRules();
    noTax();

    const result = await service.calculate({ productId: 'p1', basePrice: 249.5, qty: 4 });

    expect(result.unitPrice).toBe(249.5);
    expect(result.totalPrice).toBe(998);
  });

  it('applies a percentage rule', async () => {
    repo.findActiveRulesForProduct.mockResolvedValue([
      { type: 'percentage', discountPercent: 10, name: '10% off' } as never,
    ]);
    noTax();

    const result = await service.calculate({ productId: 'p1', basePrice: 200, qty: 2 });

    expect(result.discountPercent).toBe(10);
    expect(result.discountAmount).toBe(20);
    expect(result.priceAfterDiscount).toBe(180);
    expect(result.totalPrice).toBe(360);
    expect(result.isOnSale).toBe(true);
  });

  it('applies the matching quantity tier', async () => {
    repo.findActiveRulesForProduct.mockResolvedValue([
      {
        type: 'quantity_tier',
        name: 'bulk',
        tiers: [
          { minQty: 1, maxQty: 2, discountPercent: 0 },
          { minQty: 3, maxQty: 5, discountPercent: 10 },
          { minQty: 6, maxQty: null, discountPercent: 20 },
        ],
      } as never,
    ]);
    noTax();

    const qty6 = await service.calculate({ productId: 'p1', basePrice: 100, qty: 6 });
    expect(qty6.discountPercent).toBe(20);

    const qty2 = await service.calculate({ productId: 'p1', basePrice: 100, qty: 2 });
    expect(qty2.discountPercent).toBe(0);
  });

  it('applies a fixed price rule as override', async () => {
    repo.findActiveRulesForProduct.mockResolvedValue([
      { type: 'fixed_price', fixedPrice: 79, name: 'fixed' } as never,
    ]);
    noTax();

    const result = await service.calculate({ productId: 'p1', basePrice: 100, qty: 1 });

    expect(result.unitPrice).toBe(79);
    expect(result.isOnSale).toBe(true);
  });

  it('computes inclusive tax without changing the price', async () => {
    noRules();
    repo.findTaxRuleForCategory.mockResolvedValue({ rate: 18, isInclusive: true } as never);

    const result = await service.calculate({ productId: 'p1', basePrice: 118, qty: 1 });

    expect(result.finalPrice).toBe(118);
    expect(result.taxAmount).toBe(18);
    expect(result.isInclusive).toBe(true);
  });

  it('adds exclusive tax on top of the price', async () => {
    noRules();
    repo.findTaxRuleForCategory.mockResolvedValue({ rate: 18, isInclusive: false } as never);

    const result = await service.calculate({ productId: 'p1', basePrice: 100, qty: 2 });

    expect(result.taxAmount).toBe(18);
    expect(result.finalPrice).toBe(118);
    expect(result.totalPrice).toBe(236);
  });

  it('clamps quantity to a minimum of 1', async () => {
    noRules();
    noTax();

    const result = await service.calculate({ productId: 'p1', basePrice: 50, qty: 0 });

    expect(result.qty).toBe(1);
    expect(result.totalPrice).toBe(50);
  });

  it('never returns NaN when discount service is not involved', async () => {
    noRules();
    noTax();

    const result = await service.calculate({ productId: 'p1', basePrice: 33.33, qty: 3 });

    expect(Number.isNaN(result.totalPrice)).toBe(false);
    expect(result.totalPrice).toBeCloseTo(99.99, 2);
  });

  it('suppresses discount service usage when no promo code given', async () => {
    noRules();
    noTax();

    await service.calculate({ productId: 'p1', basePrice: 100, qty: 1 });

    const discountInstance = MockedDiscountService.mock.instances[0] as jest.Mocked<DiscountService>;
    expect(discountInstance.validatePromoCode).not.toHaveBeenCalled();
  });
});
