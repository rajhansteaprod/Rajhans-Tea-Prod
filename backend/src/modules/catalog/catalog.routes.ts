import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { upload, uploadTimeoutMiddleware, uploadErrorHandler } from '../../middleware/upload.middleware';
import { cacheResponse } from '../../middleware/cache-response.middleware';
import * as catalog from './catalog.controller';
import {
  listCategoriesSchema,
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
  listCollectionsSchema,
  createCollectionSchema,
  updateCollectionSchema,
  collectionIdSchema,
  listProductsSchema,
  createProductSchema,
  updateProductSchema,
  productIdSchema,
  productSlugSchema,
  createVariantSchema,
  updateVariantSchema,
  variantIdSchema,
  reorderVariantsSchema,
  createVariantOptionSchema,
  updateVariantOptionSchema,
  variantOptionIdSchema,
} from './catalog.validator';

const router = Router();

// ===========================================================================
// PUBLIC — no auth required
// ===========================================================================

// Categories (cached 5 min)
router.get('/catalog/categories', cacheResponse(300), catalog.listCategoriesPublic);
router.get('/catalog/categories/:slug', cacheResponse(300), catalog.getCategoryBySlug);

// Collections (cached 5 min)
router.get('/catalog/collections', cacheResponse(300), catalog.listCollectionsPublic);
router.get('/catalog/collections/:slug', cacheResponse(300), catalog.getCollectionBySlug);

// Products (cached 2 min)
router.get(
  '/catalog/products',
  validate(listProductsSchema),
  cacheResponse(120),
  catalog.listProductsPublic,
);
// All active product slugs for prerender enumeration (cached 5 min).
router.get('/catalog/product-slugs', cacheResponse(300), catalog.listProductSlugs);
router.get('/catalog/products/:slug', validate(productSlugSchema), catalog.getProductBySlug);

// Variant options — public list drives catalog facet filters (cached 5 min)
router.get('/catalog/variant-options', cacheResponse(300), catalog.listVariantOptionsPublic);

// ===========================================================================
// ADMIN — authenticate + admin role required
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

// Image upload
adminRouter.post('/uploads', uploadTimeoutMiddleware, upload.single('image'), uploadErrorHandler, catalog.uploadImage);

// Categories — admin CRUD
adminRouter.get('/categories', validate(listCategoriesSchema), catalog.listCategories);
adminRouter.post('/categories', validate(createCategorySchema), catalog.createCategory);
adminRouter.put('/categories/:id', validate(updateCategorySchema), catalog.updateCategory);
adminRouter.delete('/categories', catalog.deleteAllCategories);
adminRouter.delete('/categories/:id', validate(categoryIdSchema), catalog.deleteCategory);

// Collections — admin CRUD
adminRouter.get('/collections', validate(listCollectionsSchema), catalog.listCollections);
adminRouter.post('/collections', validate(createCollectionSchema), catalog.createCollection);
adminRouter.put('/collections/:id', validate(updateCollectionSchema), catalog.updateCollection);
adminRouter.delete('/collections/:id', validate(collectionIdSchema), catalog.deleteCollection);

// Products — admin CRUD
adminRouter.get('/products', validate(listProductsSchema), catalog.listProducts);
adminRouter.get('/products/:id', validate(productIdSchema), catalog.getProductById);
adminRouter.post('/products', validate(createProductSchema), catalog.createProduct);
adminRouter.put('/products/:id', validate(updateProductSchema), catalog.updateProduct);
adminRouter.delete('/products/:id', validate(productIdSchema), catalog.deleteProduct);

// Product Variants — admin CRUD
// NOTE: /reorder must be registered BEFORE /:variantId or it would be
// captured as a variantId and fail with an invalid-ID error.
adminRouter.get('/products/:productId/variants', catalog.listVariants);
adminRouter.post('/products/:productId/variants', validate(createVariantSchema), catalog.createVariant);
adminRouter.post('/products/:productId/variants/reorder', validate(reorderVariantsSchema), catalog.reorderVariants);
adminRouter.get('/products/:productId/variants/:variantId', validate(variantIdSchema), catalog.getVariant);
adminRouter.put('/products/:productId/variants/:variantId', validate(updateVariantSchema), catalog.updateVariant);
adminRouter.delete('/products/:productId/variants/:variantId', validate(variantIdSchema), catalog.deleteVariant);

// Variant Options — admin CRUD (global dictionary)
adminRouter.get('/variant-options', catalog.listVariantOptions);
adminRouter.post('/variant-options', validate(createVariantOptionSchema), catalog.createVariantOption);
adminRouter.put('/variant-options/:id', validate(updateVariantOptionSchema), catalog.updateVariantOption);
adminRouter.delete('/variant-options/:id', validate(variantOptionIdSchema), catalog.deleteVariantOption);

router.use('/admin', adminRouter);

export default router;
