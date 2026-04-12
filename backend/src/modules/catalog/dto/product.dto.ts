import { IProductDoc, ProductStatus } from '../models/product.model';
import { ICategoryDoc } from '../models/category.model';
import { ICollectionDoc } from '../models/collection.model';

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
  images: string[];
  reflectedImage?: string;
  attributes: Record<string, string>;
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  stock: number;
  trackInventory: boolean;
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
  images: string[];
  reflectedImage?: string;
  attributes: Record<string, string>;
  tags: string[];
  isFeatured: boolean;
  inStock: boolean;
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
  const category = product.category as unknown as ICategoryDoc;
  return {
    _id: category._id?.toString() ?? product.category.toString(),
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
  /** Admin — all fields exposed */
  static toAdmin(product: IProductDoc): ProductAdminView {
    return {
      _id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      category: extractCategory(product),
      collections: extractCollections(product),
      basePrice: product.basePrice,
      images: product.images ?? [],
      reflectedImage: product.reflectedImage,
      attributes: attributesToRecord(product.attributes),
      tags: product.tags ?? [],
      status: product.status,
      isFeatured: product.isFeatured,
      stock: product.stock ?? 0,
      trackInventory: product.trackInventory ?? false,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /** Public — hides status, stock count, trackInventory, timestamps */
  static toPublic(product: IProductDoc): ProductPublicView {
    return {
      _id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      category: extractCategory(product),
      collections: extractCollections(product),
      basePrice: product.basePrice,
      images: product.images ?? [],
      reflectedImage: product.reflectedImage,
      attributes: attributesToRecord(product.attributes),
      tags: product.tags ?? [],
      isFeatured: product.isFeatured,
      inStock: (product.stock ?? 0) > 0,
    };
  }

  /** @deprecated Use toAdmin() or toPublic() */
  static toView(product: IProductDoc): ProductAdminView {
    return ProductDTO.toAdmin(product);
  }
}
