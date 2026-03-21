import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as ctrl from './search.controller';
import { searchSchema, autocompleteSchema } from './search.validator';

const router = Router();

// ===========================================================================
// PUBLIC — Search
// ===========================================================================

router.get('/search', validate(searchSchema), ctrl.searchProducts);
router.get('/search/autocomplete', validate(autocompleteSchema), ctrl.autocomplete);
router.get('/search/popular', ctrl.popularSearches);

// ===========================================================================
// ADMIN — Search Analytics
// ===========================================================================

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/search-analytics', ctrl.adminGetAnalytics);

router.use('/admin', adminRouter);

export default router;
