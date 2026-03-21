import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './account.controller';

const router = Router();

router.get('/account/my-data', authenticate, ctrl.exportMyData);
router.delete('/account', authenticate, ctrl.deleteMyAccount);

export default router;
