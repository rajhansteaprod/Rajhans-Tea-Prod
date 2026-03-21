import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './cms.controller';

const router = Router();

// ===========================================================================
// PUBLIC — Pages, Blog, SEO
// ===========================================================================

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

// Blog
adminRouter.get('/cms/blog', ctrl.adminListBlogs);
adminRouter.post('/cms/blog', ctrl.adminCreateBlog);
adminRouter.put('/cms/blog/:id', ctrl.adminUpdateBlog);
adminRouter.delete('/cms/blog/:id', ctrl.adminDeleteBlog);

router.use('/admin', adminRouter);

export default router;
