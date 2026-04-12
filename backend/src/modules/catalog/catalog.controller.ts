import { Request, Response } from 'express';
import { CategoryService } from './services/category.service';
import { CollectionService } from './services/collection.service';
import { ProductService } from './services/product.service';
import { ProductVariantService } from './services/product-variant.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';

const categoryService = new CategoryService();
const collectionService = new CollectionService();
const productService = new ProductService();
const variantService = new ProductVariantService();

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
  sendCreated(res, data, 'Category created successfully');
};

export const updateCategory = async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const data = await categoryService.update(id, req.body);
  sendSuccess(res, data, 'Category updated successfully');
};

export const deleteCategory = async (req: Request, res: Response) => {
  await categoryService.delete(req.params['id'] as string);
  sendNoContent(res);
};

export const deleteAllCategories = async (_req: Request, res: Response) => {
  const result = await categoryService.deleteAll();
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
  sendCreated(res, data, 'Collection created successfully');
};

export const updateCollection = async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const data = await collectionService.update(id, req.body);
  sendSuccess(res, data, 'Collection updated successfully');
};

export const deleteCollection = async (req: Request, res: Response) => {
  await collectionService.delete(req.params['id'] as string);
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
  sendCreated(res, data, 'Product created successfully');
};

export const updateProduct = async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const data = await productService.update(id, req.body);
  sendSuccess(res, data, 'Product updated successfully');
};

export const deleteProduct = async (req: Request, res: Response) => {
  await productService.delete(req.params['id'] as string);
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
  sendSuccess(res, variant, 'Variant updated successfully');
};

export const deleteVariant = async (req: Request, res: Response) => {
  const variantId = req.params['variantId'] as string;
  await variantService.delete(variantId);
  sendNoContent(res);
};

export const reorderVariants = async (req: Request, res: Response) => {
  const productId = req.params['productId'] as string;
  const { variantIds } = req.body as { variantIds: string[] };
  if (!Array.isArray(variantIds)) {
    throw new BadRequestError('variantIds must be an array');
  }
  await variantService.reorderVariants(productId, variantIds);
  sendSuccess(res, { reordered: true }, 'Variants reordered successfully');
};

// ---------------------------------------------------------------------------
// Upload controller
// ---------------------------------------------------------------------------

export const uploadImage = async (req: Request, res: Response) => {
  if (!req.file) {
    throw new BadRequestError('No file uploaded');
  }
  const url = `/uploads/${req.file.filename}`;
  sendSuccess(res, { url }, 'Image uploaded successfully');
};
