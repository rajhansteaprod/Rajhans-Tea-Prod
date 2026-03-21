import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import * as ctrl from './workflow.controller';

const router = Router();

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(authorize('admin'));

// Definitions
adminRouter.get('/workflows/definitions', ctrl.listDefinitions);
adminRouter.post('/workflows/definitions', ctrl.createDefinition);
adminRouter.put('/workflows/definitions/:id', ctrl.updateDefinition);
adminRouter.delete('/workflows/definitions/:id', ctrl.deleteDefinition);

// Instances
adminRouter.get('/workflows/stats', ctrl.getWorkflowStats);
adminRouter.get('/workflows/pending', ctrl.getPendingInstances);
adminRouter.post('/workflows/start', ctrl.startWorkflow);
adminRouter.get('/workflows/instances/:id', ctrl.getWorkflowInstance);
adminRouter.get('/workflows/instances/:id/transitions', ctrl.getAvailableTransitions);
adminRouter.post('/workflows/instances/:id/transition', ctrl.transitionWorkflow);

router.use('/admin', adminRouter);

export default router;
