import { IProductDoc, ProductStatus } from '../models/product.model';
import { ICategoryDoc } from '../models/category.model';
import { ICollectionDoc } from '../models/collection.model';

export interface ProductView {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  category: { _id: string; name: string; slug: string };
  collections: { _id: string; name: string; slug: string }[];
  basePrice: number;
  images: string[];
  attributes: Record<string, string>;
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function attributesToRecord(attrs: Map<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!attrs) return result;
  for (const [k, v] of attrs) {
    result[k] = v;
  }
  return result;
}

export class ProductDTO {
  static toView(product: IProductDoc): ProductView {
    const category = product.category as unknown as ICategoryDoc;
    const collections = (product.collections ?? []) as unknown as ICollectionDoc[];

    return {
      _id: product._id.toString(),
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      category: {
        _id: category._id?.toString() ?? product.category.toString(),
        name: category.name ?? '',
        slug: category.slug ?? '',
      },
      collections: collections.map((c) => ({
        _id: c._id?.toString() ?? c.toString(),
        name: c.name ?? '',
        slug: c.slug ?? '',
      })),
      basePrice: product.basePrice,
      images: product.images ?? [],
      attributes: attributesToRecord(product.attributes),
      tags: product.tags ?? [],
      status: product.status,
      isFeatured: product.isFeatured,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
