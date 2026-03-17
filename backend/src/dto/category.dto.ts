import { ICategoryDoc } from '../models/category.model';

export interface CategoryView {
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

export class CategoryDTO {
  static toView(cat: ICategoryDoc): CategoryView {
    const parent = cat.parent as unknown as ICategoryDoc | null;
    return {
      _id:         cat._id.toString(),
      name:        cat.name,
      slug:        cat.slug,
      description: cat.description,
      image:       cat.image,
      parent:      parent
        ? { _id: parent._id.toString(), name: parent.name, slug: parent.slug }
        : null,
      isActive:    cat.isActive,
      sortOrder:   cat.sortOrder,
      createdAt:   cat.createdAt,
      updatedAt:   cat.updatedAt,
    };
  }
}
