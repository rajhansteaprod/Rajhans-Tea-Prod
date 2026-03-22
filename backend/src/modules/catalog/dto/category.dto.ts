import { ICategoryDoc } from '../models/category.model';

// ---------------------------------------------------------------------------
// Admin view — everything
// ---------------------------------------------------------------------------
export interface CategoryAdminView {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent: { _id: string; name: string; slug: string } | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Public view — hides isActive, sortOrder, timestamps
// ---------------------------------------------------------------------------
export interface CategoryPublicView {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent: { _id: string; name: string; slug: string } | null;
}

// Keep backward compat
export type CategoryView = CategoryAdminView;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractParent(cat: ICategoryDoc) {
  const parent = cat.parent as unknown as ICategoryDoc | null;
  return parent
    ? { _id: parent._id.toString(), name: parent.name, slug: parent.slug }
    : null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export class CategoryDTO {
  /** Admin — all fields exposed */
  static toAdmin(cat: ICategoryDoc): CategoryAdminView {
    return {
      _id: cat._id.toString(),
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      image: cat.image,
      parent: extractParent(cat),
      isActive: cat.isActive,
      sortOrder: cat.sortOrder,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    };
  }

  /** Public — hides isActive, sortOrder, timestamps */
  static toPublic(cat: ICategoryDoc): CategoryPublicView {
    return {
      _id: cat._id.toString(),
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      image: cat.image,
      parent: extractParent(cat),
    };
  }

  /** @deprecated Use toAdmin() or toPublic() */
  static toView(cat: ICategoryDoc): CategoryAdminView {
    return CategoryDTO.toAdmin(cat);
  }
}
