import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { contactSubmitSchema, updateSubmissionSchema } from './contact.validator';
import * as contactController from './contact.controller';

const router = Router();

// Public endpoint - submit contact form
router.post(
  '/contact/submit',
  validate(contactSubmitSchema),
  contactController.submitContact
);

// Admin endpoints - manage submissions
router.get(
  '/contact/submissions',
  authenticate,
  authorize('admin'),
  contactController.getSubmissions
);

router.get(
  '/contact/submissions/:referenceId',
  authenticate,
  authorize('admin'),
  contactController.getSubmissionById
);

router.put(
  '/contact/submissions/:referenceId',
  authenticate,
  authorize('admin'),
  validate(updateSubmissionSchema),
  contactController.updateSubmission
);

router.delete(
  '/contact/submissions/:referenceId',
  authenticate,
  authorize('admin'),
  contactController.deleteSubmission
);

// Admin endpoint - get metrics
router.get(
  '/contact/metrics',
  authenticate,
  authorize('admin'),
  contactController.getMetrics
);

export default router;
