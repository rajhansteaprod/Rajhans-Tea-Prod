import { ICollectionDoc } from '../models/collection.model';

export interface CollectionView {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  productCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class CollectionDTO {
  static toView(col: ICollectionDoc, productCount?: number): CollectionView {
    return {
      _id:          col._id.toString(),
      name:         col.name,
      slug:         col.slug,
      description:  col.description,
      image:        col.image,
      isActive:     col.isActive,
      isFeatured:   col.isFeatured,
      sortOrder:    col.sortOrder,
      productCount,
      createdAt:    col.createdAt,
      updatedAt:    col.updatedAt,
    };
  }
}
