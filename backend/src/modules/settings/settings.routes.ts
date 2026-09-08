import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './settings.controller';
import * as homepageSectionCtrl from './homepage-section.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/settings', ctrl.getSettings);
adminRouter.put('/settings', ctrl.updateSettings);

adminRouter.get('/homepage-sections', homepageSectionCtrl.listHomepageSectionsAdmin);
adminRouter.post('/homepage-sections', homepageSectionCtrl.createHomepageSection);
adminRouter.put('/homepage-sections/:id', homepageSectionCtrl.updateHomepageSection);
adminRouter.delete('/homepage-sections/:id', homepageSectionCtrl.deleteHomepageSection);
adminRouter.post('/homepage-sections/reorder', homepageSectionCtrl.reorderHomepageSections);

// Public routes
router.get('/catalog/homepage-sections', ctrl.getHomepageSectionsPublic);
router.get('/catalog/store-settings', ctrl.getPublicSettings);

router.use('/admin', adminRouter);

export default router;

