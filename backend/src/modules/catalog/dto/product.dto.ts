import { IProductDoc, ProductStatus } from '../models/product.model';
import { ICategoryDoc } from '../models/category.model';
import { ICollectionDoc } from '../models/collection.model';
import { IProductVariantDoc } from '../models/product-variant.model';

// ---------------------------------------------------------------------------
// Variant view
// ---------------------------------------------------------------------------
export interface ProductVariantView {
  _id: string;
  name: string;
  optionKey?: string;
  optionValue?: string;
  price: number;
  discountedPrice?: number;
  stock?: number;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Admin view — everything visible (internal management)
// ---------------------------------------------------------------------------
export interface ProductAdminView {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  category: { _id: string; name: string; slug: string };
  collections: { _id: string; name: string; slug: string }[];
  basePrice: number;
  discountedPrice?: number;
  images: string[];
  primaryImage?: string;
  imageAltText?: string;
  reflectedImage?: string;
  attributes: Record<string, string>;
  tags: string[];
  region?: string;
  bestTakenFor?: string;
  status: ProductStatus;
  isFeatured: boolean;
  showBadge: boolean;
  badgeText?: string;
  stock: number;
  trackInventory: boolean;
  hasVariants: boolean;
  variants?: ProductVariantView[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Public view — only what customers need (no internal/admin fields)
// ---------------------------------------------------------------------------
export interface ProductPublicView {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  category: { _id: string; name: string; slug: string };
  collections: { _id: string; name: string; slug: string }[];
  basePrice: number;
  discountedPrice?: number;
  images: string[];
  primaryImage?: string;
  imageAltText?: string;
  reflectedImage?: string;
  attributes: Record<string, string>;
  tags: string[];
  region?: string;
  bestTakenFor?: string;
  isFeatured: boolean;
  showBadge: boolean;
  badgeText?: string;
  inStock: boolean;
  hasVariants: boolean;
  variants?: ProductVariantView[];
}

// Keep backward compat
export type ProductView = ProductAdminView;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function attributesToRecord(attrs: Map<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!attrs) return result;
  for (const [k, v] of attrs) {
    result[k] = v;
  }
  return result;
}

function extractCategory(product: IProductDoc) {
  const category = product.category as unknown as ICategoryDoc | null;
  // category can be null when the referenced category was deleted
  if (!category) {
    return { _id: '', name: '', slug: '' };
  }
  return {
    _id: category._id?.toString() ?? category.toString(),
    name: category.name ?? '',
    slug: category.slug ?? '',
  };
}

function extractCollections(product: IProductDoc) {
  const collections = (product.collections ?? []) as unknown as ICollectionDoc[];
  return collections.map((c) => ({
    _id: c._id?.toString() ?? c.toString(),
    name: c.name ?? '',
    slug: c.slug ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export class ProductDTO {
  private static variantsToView(variants?: IProductVariantDoc[]): ProductVariantView[] {
    return (variants ?? []).map(v => ({
      _id: v._id.toString(),
      name: v.name,
      optionKey: v.optionKey,
      optionValue: v.optionValue,
      price: v.price,
      discountedPrice: v.discountedPrice,
      stock: v.stock,
      isActive: v.isActive,
    }));
  }

  /** Admin — all fields exposed */
  static toAdmin(product: IProductDoc, variants?: IProductVariantDoc[]): ProductAdminView {
    return {
      _id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      category: extractCategory(product),
      collections: extractCollections(product),
      basePrice: product.basePrice,
      discountedPrice: product.discountedPrice,
      images: product.images ?? [],
      primaryImage: product.primaryImage || product.images?.[0] || '',
      imageAltText: product.imageAltText || product.name,
      reflectedImage: product.reflectedImage || product.primaryImage || product.images?.[0] || '',
      attributes: attributesToRecord(product.attributes),
      tags: product.tags ?? [],
      region: product.region,
      bestTakenFor: product.bestTakenFor,
      status: product.status,
      isFeatured: product.isFeatured,
      showBadge: product.showBadge ?? false,
      badgeText: product.badgeText,
      stock: product.stock ?? 0,
      trackInventory: product.trackInventory ?? false,
      hasVariants: product.hasVariants ?? false,
      variants: variants ? this.variantsToView(variants) : undefined,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /** Public — hides status, stock count, trackInventory, timestamps */
  static toPublic(product: IProductDoc, variants?: IProductVariantDoc[]): ProductPublicView {
    return {
      _id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      category: extractCategory(product),
      collections: extractCollections(product),
      basePrice: product.basePrice,
      discountedPrice: product.discountedPrice,
      images: product.images ?? [],
      primaryImage: product.primaryImage || product.images?.[0] || '',
      imageAltText: product.imageAltText || product.name,
      reflectedImage: product.reflectedImage || product.primaryImage || product.images?.[0] || '',
      attributes: attributesToRecord(product.attributes),
      tags: product.tags ?? [],
      region: product.region,
      bestTakenFor: product.bestTakenFor,
      isFeatured: product.isFeatured,
      showBadge: product.showBadge ?? false,
      badgeText: product.badgeText,
      inStock: product.hasVariants && variants
        ? variants.some(v => v.isActive && v.stock > 0)
        : (product.stock ?? 0) > 0,
      hasVariants: product.hasVariants ?? false,
      variants: variants ? this.variantsToView(variants) : undefined,
    };
  }

  /** @deprecated Use toAdmin() or toPublic() */
  static toView(product: IProductDoc): ProductAdminView {
    return ProductDTO.toAdmin(product);
  }
}
