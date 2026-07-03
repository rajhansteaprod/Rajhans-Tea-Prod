// =============================================================================
// UNIT TESTS — ProductService (admin CRUD)
// Locks down the admin-panel regressions: every submitted field must reach the
// repository write, null must clear optional fields, delete must clean up
// dependents. All repositories and models mocked.
// =============================================================================

import { Types } from 'mongoose';

jest.mock('../../../src/modules/catalog/repositories/product.repository');
jest.mock('../../../src/modules/catalog/repositories/product-variant.repository');
jest.mock('../../../src/modules/catalog/repositories/category.repository');
jest.mock('../../../src/modules/catalog/repositories/collection.repository');
jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const variantDeleteMany = jest.fn(() => ({ exec: () => Promise.resolve({}) }));
const cartUpdateMany = jest.fn(() => ({ exec: () => Promise.resolve({}) }));
jest.mock('../../../src/modules/catalog/models/product-variant.model', () => ({
  ProductVariant: { deleteMany: (...args: unknown[]) => variantDeleteMany(...(args as [])) },
}));
jest.mock('../../../src/modules/cart/models/cart.model', () => ({
  Cart: { updateMany: (...args: unknown[]) => cartUpdateMany(...(args as [])) },
}));

import { ProductService } from '../../../src/modules/catalog/services/product.service';
import { ProductRepository } from '../../../src/modules/catalog/repositories/product.repository';
import { ProductVariantRepository } from '../../../src/modules/catalog/repositories/product-variant.repository';
import { CategoryRepository } from '../../../src/modules/catalog/repositories/category.repository';

const MockedProductRepo = ProductRepository as jest.MockedClass<typeof ProductRepository>;
const MockedVariantRepo = ProductVariantRepository as jest.MockedClass<typeof ProductVariantRepository>;
const MockedCategoryRepo = CategoryRepository as jest.MockedClass<typeof CategoryRepository>;

const PRODUCT_ID = new Types.ObjectId().toString();
const CATEGORY_ID = new Types.ObjectId().toString();

describe('ProductService', () => {
  let service: ProductService;
  let productRepo: jest.Mocked<ProductRepository>;
  let variantRepo: jest.Mocked<ProductVariantRepository>;
  let categoryRepo: jest.Mocked<CategoryRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductService();
    productRepo = MockedProductRepo.mock.instances[0] as jest.Mocked<ProductRepository>;
    variantRepo = MockedVariantRepo.mock.instances[0] as jest.Mocked<ProductVariantRepository>;
    categoryRepo = MockedCategoryRepo.mock.instances[0] as jest.Mocked<CategoryRepository>;

    categoryRepo.findById.mockResolvedValue({ _id: CATEGORY_ID } as never);
    productRepo.slugExists.mockResolvedValue(false);
    variantRepo.findByProductId.mockResolvedValue([]); // no variant price sync
    // create/update return paths go through getById — stub it
    jest.spyOn(service, 'getById').mockResolvedValue({ _id: PRODUCT_ID } as never);
  });

  describe('create', () => {
    const baseInput = {
      name: 'Assam Gold',
      categoryId: CATEGORY_ID,
      basePrice: 250,
      images: ['/uploads/a.jpg'],
    };

    it('persists every submitted field — including showBadge and badgeText', async () => {
      productRepo.create.mockResolvedValue({ _id: new Types.ObjectId(PRODUCT_ID) } as never);

      await service.create({
        ...baseInput,
        discountedPrice: 199,
        showBadge: true,
        badgeText: 'Bestseller',
        region: 'Assam',
        bestTakenFor: 'Morning',
        status: 'active',
        isFeatured: true,
        stock: 10,
        trackInventory: true,
        tags: ['CTC', ' Strong '],
      });

      expect(productRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Assam Gold',
          basePrice: 250,
          discountedPrice: 199,
          showBadge: true,
          badgeText: 'Bestseller',
          region: 'Assam',
          bestTakenFor: 'Morning',
          status: 'active',
          isFeatured: true,
          stock: 10,
          trackInventory: true,
          tags: ['ctc', 'strong'],
        }),
      );
    });

    it('rejects a discountedPrice that is not lower than basePrice', async () => {
      await expect(
        service.create({ ...baseInput, discountedPrice: 250 }),
      ).rejects.toThrow(/lower than basePrice/);
      expect(productRepo.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown category', async () => {
      categoryRepo.findById.mockResolvedValue(null);
      await expect(service.create(baseInput)).rejects.toThrow('Category not found');
    });

    it('generates a unique slug when the base slug is taken', async () => {
      productRepo.slugExists.mockResolvedValueOnce(true).mockResolvedValue(false);
      productRepo.create.mockResolvedValue({ _id: new Types.ObjectId(PRODUCT_ID) } as never);

      await service.create(baseInput);

      const created = productRepo.create.mock.calls[0][0] as { slug: string };
      expect(created.slug).not.toBe('assam-gold'); // suffixed to stay unique
      expect(created.slug).toContain('assam-gold');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      productRepo.findById.mockResolvedValue({
        _id: new Types.ObjectId(PRODUCT_ID),
        name: 'Assam Gold',
        slug: 'assam-gold',
        basePrice: 250,
        discountedPrice: 199,
      } as never);
      productRepo.updateById.mockResolvedValue({ _id: PRODUCT_ID } as never);
    });

    it('writes changed fields including showBadge/badgeText', async () => {
      await service.update(PRODUCT_ID, {
        basePrice: 300,
        showBadge: true,
        badgeText: 'New',
      });

      expect(productRepo.updateById).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({ basePrice: 300, showBadge: true, badgeText: 'New' }),
      );
    });

    it('does not touch fields that were not submitted', async () => {
      await service.update(PRODUCT_ID, { name: 'Assam Gold' });

      const updateArg = productRepo.updateById.mock.calls[0][1] as Record<string, unknown>;
      expect(updateArg).not.toHaveProperty('basePrice');
      expect(updateArg).not.toHaveProperty('status');
      expect(updateArg).not.toHaveProperty('images');
    });

    it('clears discount, region and bestTakenFor via $unset when null is sent', async () => {
      await service.update(PRODUCT_ID, {
        discountedPrice: null,
        region: null,
        bestTakenFor: null,
      });

      expect(productRepo.updateById).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({
          $unset: expect.objectContaining({ discountedPrice: 1, region: 1, bestTakenFor: 1 }),
        }),
      );
    });

    it('rejects updates that would make discountedPrice >= basePrice', async () => {
      await expect(
        service.update(PRODUCT_ID, { basePrice: 150 }), // existing discount 199 >= 150
      ).rejects.toThrow(/lower than basePrice/);
      expect(productRepo.updateById).not.toHaveBeenCalled();
    });

    it('keeps the slug stable when the name has not changed', async () => {
      await service.update(PRODUCT_ID, { name: 'Assam Gold' });
      const updateArg = productRepo.updateById.mock.calls[0][1] as Record<string, unknown>;
      expect(updateArg).not.toHaveProperty('slug');
    });

    it('404s on a missing product', async () => {
      productRepo.findById.mockResolvedValue(null);
      await expect(service.update(PRODUCT_ID, { name: 'x' })).rejects.toThrow('Product not found');
    });
  });

  describe('delete', () => {
    it('deletes the product plus its variants and cart references', async () => {
      productRepo.findById.mockResolvedValue({
        _id: new Types.ObjectId(PRODUCT_ID),
        name: 'Assam Gold',
        slug: 'assam-gold',
      } as never);
      productRepo.deleteById.mockResolvedValue({} as never);

      await service.delete(PRODUCT_ID);

      expect(variantDeleteMany).toHaveBeenCalled();
      expect(cartUpdateMany).toHaveBeenCalled();
      expect(productRepo.deleteById).toHaveBeenCalledWith(PRODUCT_ID);
    });

    it('404s when deleting a non-existent product and touches nothing', async () => {
      productRepo.findById.mockResolvedValue(null);

      await expect(service.delete(PRODUCT_ID)).rejects.toThrow('Product not found');
      expect(productRepo.deleteById).not.toHaveBeenCalled();
      expect(variantDeleteMany).not.toHaveBeenCalled();
    });
  });
});
