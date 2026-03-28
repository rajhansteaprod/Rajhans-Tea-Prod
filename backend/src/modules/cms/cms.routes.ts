import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { upload } from '../../middleware/upload.middleware';
import * as ctrl from './cms.controller';

const router = Router();

// ===========================================================================
// PUBLIC — Pages, Blog, SEO
// ===========================================================================

router.get('/hero-slides', ctrl.getActiveHeroSlides);
router.get('/pages/:slug', ctrl.getPageBySlug);
router.get('/blog', ctrl.listPublishedBlogs);
router.get('/blog/:slug', ctrl.getBlogBySlug);
router.get('/sitemap.xml', ctrl.getSitemap);
router.get('/robots.txt', ctrl.getRobotsTxt);

// ===========================================================================
// ADMIN — CMS Management
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

// Pages
adminRouter.get('/cms/pages', ctrl.adminListPages);
adminRouter.post('/cms/pages', ctrl.adminCreatePage);
adminRouter.put('/cms/pages/:id', ctrl.adminUpdatePage);
adminRouter.delete('/cms/pages/:id', ctrl.adminDeletePage);

// Hero Slides
const heroUpload = upload.fields([
  { name: 'desktopImage', maxCount: 1 },
  { name: 'mobileImage', maxCount: 1 },
]);
adminRouter.get('/cms/hero-slides', ctrl.adminListHeroSlides);
adminRouter.post('/cms/hero-slides', heroUpload, ctrl.adminCreateHeroSlide);
adminRouter.put('/cms/hero-slides/:id', heroUpload, ctrl.adminUpdateHeroSlide);
adminRouter.delete('/cms/hero-slides/:id', ctrl.adminDeleteHeroSlide);
adminRouter.patch('/cms/hero-slides/reorder', ctrl.adminReorderHeroSlides);

// Blog
adminRouter.get('/cms/blog', ctrl.adminListBlogs);
adminRouter.post('/cms/blog', ctrl.adminCreateBlog);
adminRouter.put('/cms/blog/:id', ctrl.adminUpdateBlog);
adminRouter.delete('/cms/blog/:id', ctrl.adminDeleteBlog);

router.use('/admin', adminRouter);

export default router;
