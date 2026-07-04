import { Request, Response } from 'express';
import { CategoryService } from './services/category.service';
import { CollectionService } from './services/collection.service';
import { ProductService } from './services/product.service';
import { ProductVariantService } from './services/product-variant.service';
import { VariantOptionService } from './services/variant-option.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';
import { invalidateCache } from '../../middleware/cache-response.middleware';

/** Flush all cached public catalog + homepage-sections responses */
const invalidateCatalogCache = () => invalidateCache('*');

const categoryService = new CategoryService();
const collectionService = new CollectionService();
const productService = new ProductService();
const variantService = new ProductVariantService();
const variantOptionService = new VariantOptionService();

// ---------------------------------------------------------------------------
// Category controllers
// ---------------------------------------------------------------------------

export const listCategories = async (req: Request, res: Response) => {
  const { categories, meta } = await categoryService.listForAdmin(req.query as never);
  sendPaginated(res, categories, meta, 'Categories retrieved');
};

export const listCategoriesPublic = async (_req: Request, res: Response) => {
  const categories = await categoryService.listPublic();
  sendSuccess(res, categories);
};

export const getCategoryBySlug = async (req: Request, res: Response) => {
  const data = await categoryService.getBySlug(req.params['slug'] as string);
  sendSuccess(res, data);
};

export const createCategory = async (req: Request, res: Response) => {
  const data = await categoryService.create(req.body);
  await invalidateCatalogCache();
  sendCreated(res, data, 'Category created successfully');
};

export const updateCategory = async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const data = await categoryService.update(id, req.body);
  await invalidateCatalogCache();
  sendSuccess(res, data, 'Category updated successfully');
};

export const deleteCategory = async (req: Request, res: Response) => {
  await categoryService.delete(req.params['id'] as string);
  await invalidateCatalogCache();
  sendNoContent(res);
};

export const deleteAllCategories = async (_req: Request, res: Response) => {
  const result = await categoryService.deleteAll();
  await invalidateCatalogCache();
  sendSuccess(res, result, 'All categories deleted');
};

// ---------------------------------------------------------------------------
// Collection controllers
// ---------------------------------------------------------------------------

export const listCollections = async (req: Request, res: Response) => {
  const { collections, meta } = await collectionService.listForAdmin(req.query as never);
  sendPaginated(res, collections, meta, 'Collections retrieved');
};

export const listCollectionsPublic = async (_req: Request, res: Response) => {
  const collections = await collectionService.listPublic();
  sendSuccess(res, collections);
};

export const getCollectionBySlug = async (req: Request, res: Response) => {
  const data = await collectionService.getBySlug(req.params['slug'] as string);
  sendSuccess(res, data);
};

export const createCollection = async (req: Request, res: Response) => {
  const data = await collectionService.create(req.body);
  await invalidateCatalogCache();
  sendCreated(res, data, 'Collection created successfully');
};

export const updateCollection = async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const data = await collectionService.update(id, req.body);
  await invalidateCatalogCache();
  sendSuccess(res, data, 'Collection updated successfully');
};

export const deleteCollection = async (req: Request, res: Response) => {
  await collectionService.delete(req.params['id'] as string);
  await invalidateCatalogCache();
  sendNoContent(res);
};

// ---------------------------------------------------------------------------
// Product controllers
// ---------------------------------------------------------------------------

export const listProducts = async (req: Request, res: Response) => {
  const { products, meta } = await productService.list(req.query as never);
  sendPaginated(res, products, meta, 'Products retrieved');
};

export const listProductsPublic = async (req: Request, res: Response) => {
  const { products, meta } = await productService.listPublic(req.query as never);
  sendPaginated(res, products, meta, 'Products retrieved');
};

export const getProductBySlug = async (req: Request, res: Response) => {
  const data = await productService.getBySlug(req.params['slug'] as string);
  sendSuccess(res, data);
};

export const getProductById = async (req: Request, res: Response) => {
  const data = await productService.getById(req.params['id'] as string);
  sendSuccess(res, data);
};

export const createProduct = async (req: Request, res: Response) => {
  const data = await productService.create(req.body);
  await invalidateCatalogCache();
  sendCreated(res, data, 'Product created successfully');
};

export const updateProduct = async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const data = await productService.update(id, req.body);
  await invalidateCatalogCache();
  sendSuccess(res, data, 'Product updated successfully');
};

export const deleteProduct = async (req: Request, res: Response) => {
  await productService.delete(req.params['id'] as string);
  await invalidateCatalogCache();
  sendNoContent(res);
};

// ---------------------------------------------------------------------------
// Product Variant controllers
// ---------------------------------------------------------------------------

export const listVariants = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const variants = await variantService.listByProductId(productId);
  sendSuccess(res, variants, 'Variants retrieved');
};

export const createVariant = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const variant = await variantService.create(productId, req.body);
  await invalidateCatalogCache();
  sendCreated(res, variant, 'Variant created successfully');
};

export const getVariant = async (req: Request, res: Response) => {
  const variantId = req.params['variantId'] as string;
  const variant = await variantService.getById(variantId);
  sendSuccess(res, variant);
};

export const updateVariant = async (req: Request, res: Response) => {
  const variantId = req.params['variantId'] as string;
  const variant = await variantService.update(variantId, req.body);
  await invalidateCatalogCache();
  sendSuccess(res, variant, 'Variant updated successfully');
};

export const deleteVariant = async (req: Request, res: Response) => {
  const variantId = req.params['variantId'] as string;
  await variantService.delete(variantId);
  await invalidateCatalogCache();
  sendNoContent(res);
};

export const reorderVariants = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { variantIds } = req.body as { variantIds: string[] };
  if (!Array.isArray(variantIds)) {
    throw new BadRequestError('variantIds must be an array');
  }
  await variantService.reorderVariants(productId, variantIds);
  await invalidateCatalogCache();
  sendSuccess(res, { reordered: true }, 'Variants reordered successfully');
};

// ---------------------------------------------------------------------------
// Upload controller
// ---------------------------------------------------------------------------

export const uploadImage = async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequestError('No file uploaded');
  }
  if (!req.file.filename) {
    throw new BadRequestError('Failed to process file upload');
  }
  const url = `/uploads/${req.file.filename}`;
  sendSuccess(res, { url }, 'Image uploaded successfully');
};

// ---------------------------------------------------------------------------
// Variant Option controllers (global dictionary)
// ---------------------------------------------------------------------------

export const listVariantOptionsPublic = async (_req: Request, res: Response) => {
  const data = await variantOptionService.listPublic();
  sendSuccess(res, data);
};

export const listVariantOptions = async (_req: Request, res: Response) => {
  const data = await variantOptionService.listForAdmin();
  sendSuccess(res, data);
};

export const createVariantOption = async (req: Request, res: Response) => {
  const data = await variantOptionService.create(req.body);
  await invalidateCatalogCache();
  sendCreated(res, data, 'Variant option created successfully');
};

export const updateVariantOption = async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const data = await variantOptionService.update(id, req.body);
  await invalidateCatalogCache();
  sendSuccess(res, data, 'Variant option updated successfully');
};

export const deleteVariantOption = async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  await variantOptionService.delete(id);
  await invalidateCatalogCache();
  sendNoContent(res);
};
