import { ProductDTO } from '../../../src/modules/catalog/dto/product.dto';
import { Types } from 'mongoose';

describe('ProductDTO', () => {
  const categoryId = new Types.ObjectId();
  const collectionId = new Types.ObjectId();
  const productId = new Types.ObjectId();

  const mockCategory = {
    _id: categoryId,
    name: 'Green Tea',
    slug: 'green-tea',
  };

  const mockCollection = {
    _id: collectionId,
    name: 'Best Sellers',
    slug: 'best-sellers',
  };

  const baseProduct: any = {
    _id: productId,
    name: 'Premium Jasmine Green',
    slug: 'premium-jasmine-green',
    description: 'A premium green tea',
    shortDescription: 'Jasmine green tea',
    category: mockCategory,
    collections: [mockCollection],
    basePrice: 500,
    discountedPrice: 450,
    images: ['img1.png', 'img2.png'],
    attributes: new Map([['Grade', 'FTGFOP']]),
    tags: ['organic', 'jasmine'],
    region: 'Assam',
    bestTakenFor: 'Morning',
    status: 'active',
    isFeatured: true,
    stock: 100,
    trackInventory: true,
    hasVariants: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  describe('toAdmin', () => {
    it('should map all fields correctly and keep custom image fields if present', () => {
      const prod = {
        ...baseProduct,
        primaryImage: 'primary.png',
        reflectedImage: 'reflected.png',
        imageAltText: 'Jasmine packet front',
      };

      const result = ProductDTO.toAdmin(prod);

      expect(result._id).toBe(productId.toString());
      expect(result.name).toBe('Premium Jasmine Green');
      expect(result.primaryImage).toBe('primary.png');
      expect(result.reflectedImage).toBe('reflected.png');
      expect(result.imageAltText).toBe('Jasmine packet front');
      expect(result.region).toBe('Assam');
      expect(result.bestTakenFor).toBe('Morning');
      expect(result.status).toBe('active');
    });

    it('should fallback primaryImage and reflectedImage to the first image when not specified', () => {
      const prod = {
        ...baseProduct,
        primaryImage: undefined,
        reflectedImage: undefined,
        imageAltText: undefined,
      };

      const result = ProductDTO.toAdmin(prod);

      expect(result.primaryImage).toBe('img1.png');
      expect(result.reflectedImage).toBe('img1.png');
      expect(result.imageAltText).toBe('Premium Jasmine Green');
    });

    it('should fallback reflectedImage to primaryImage when primaryImage is specified but reflectedImage is not', () => {
      const prod = {
        ...baseProduct,
        primaryImage: 'primary.png',
        reflectedImage: undefined,
        imageAltText: undefined,
      };

      const result = ProductDTO.toAdmin(prod);

      expect(result.primaryImage).toBe('primary.png');
      expect(result.reflectedImage).toBe('primary.png');
    });

    it('should return empty strings/fallbacks if images array is empty or undefined', () => {
      const prod = {
        ...baseProduct,
        images: [],
        primaryImage: undefined,
        reflectedImage: undefined,
      };

      const result = ProductDTO.toAdmin(prod);

      expect(result.primaryImage).toBe('');
      expect(result.reflectedImage).toBe('');
    });
  });

  describe('toPublic', () => {
    it('should map fields correctly to the public view', () => {
      const prod = {
        ...baseProduct,
        primaryImage: 'primary.png',
        reflectedImage: 'reflected.png',
        imageAltText: 'Jasmine packet front',
      };

      const result = ProductDTO.toPublic(prod);

      expect(result._id).toBe(productId.toString());
      expect(result.primaryImage).toBe('primary.png');
      expect(result.reflectedImage).toBe('reflected.png');
      expect(result.imageAltText).toBe('Jasmine packet front');
      expect(result.inStock).toBe(true);
      expect((result as any).status).toBeUndefined();
      expect((result as any).stock).toBeUndefined();
    });

    it('should correctly determine inStock based on stock count', () => {
      const prodInStock = { ...baseProduct, stock: 5 };
      expect(ProductDTO.toPublic(prodInStock).inStock).toBe(true);

      const prodOutOfStock = { ...baseProduct, stock: 0 };
      expect(ProductDTO.toPublic(prodOutOfStock).inStock).toBe(false);
    });
  });
});
