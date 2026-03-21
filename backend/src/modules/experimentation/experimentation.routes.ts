import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './experimentation.controller';

const router = Router();

// Public — variant assignment
router.get('/experiments', ctrl.getAssignedVariants);
router.get('/experiments/:slug', ctrl.getVariant);

// Admin
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

adminRouter.get('/experiments', ctrl.listExperiments);
adminRouter.post('/experiments', ctrl.createExperiment);
adminRouter.put('/experiments/:id', ctrl.updateExperiment);
adminRouter.delete('/experiments/:id', ctrl.deleteExperiment);
adminRouter.post('/experiments/:id/start', ctrl.startExperiment);
adminRouter.post('/experiments/:id/stop', ctrl.stopExperiment);
adminRouter.get('/experiments/:slug/results', ctrl.getExperimentResults);

router.use('/admin', adminRouter);

export default router;
