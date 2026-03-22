import { ICollectionDoc } from '../models/collection.model';

// ---------------------------------------------------------------------------
// Admin view — everything
// ---------------------------------------------------------------------------
export interface CollectionAdminView {
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

// ---------------------------------------------------------------------------
// Public view — hides isActive, isFeatured, sortOrder, timestamps
// ---------------------------------------------------------------------------
export interface CollectionPublicView {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  productCount?: number;
}

// Keep backward compat
export type CollectionView = CollectionAdminView;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export class CollectionDTO {
  /** Admin — all fields exposed */
  static toAdmin(col: ICollectionDoc, productCount?: number): CollectionAdminView {
    return {
      _id: col._id.toString(),
      name: col.name,
      slug: col.slug,
      description: col.description,
      image: col.image,
      isActive: col.isActive,
      isFeatured: col.isFeatured,
      sortOrder: col.sortOrder,
      productCount,
      createdAt: col.createdAt,
      updatedAt: col.updatedAt,
    };
  }

  /** Public — hides isActive, isFeatured, sortOrder, timestamps */
  static toPublic(col: ICollectionDoc, productCount?: number): CollectionPublicView {
    return {
      _id: col._id.toString(),
      name: col.name,
      slug: col.slug,
      description: col.description,
      image: col.image,
      productCount,
    };
  }

  /** @deprecated Use toAdmin() or toPublic() */
  static toView(col: ICollectionDoc, productCount?: number): CollectionAdminView {
    return CollectionDTO.toAdmin(col, productCount);
  }
}
