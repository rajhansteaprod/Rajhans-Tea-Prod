import { Request, Response } from 'express';
import { WorkflowService } from './services/workflow.service';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../../utils/api-response';

const workflowService = new WorkflowService();

// ─── Definitions (Admin) ─────────────────────────────────────────────────────

export const listDefinitions = async (_req: Request, res: Response) => {
  const definitions = await workflowService.listDefinitions();
  sendSuccess(res, definitions);
};

export const createDefinition = async (req: Request, res: Response) => {
  const def = await workflowService.createDefinition(req.body);
  sendCreated(res, def, 'Workflow definition created');
};

export const updateDefinition = async (req: Request, res: Response) => {
  const def = await workflowService.updateDefinition(req.params['id'] as string, req.body);
  sendSuccess(res, def, 'Definition updated');
};

export const deleteDefinition = async (req: Request, res: Response) => {
  await workflowService.deleteDefinition(req.params['id'] as string);
  sendNoContent(res);
};

// ─── Instances (Admin) ───────────────────────────────────────────────────────

export const startWorkflow = async (req: Request, res: Response) => {
  const { definitionSlug, resourceType, resourceId, metadata } = req.body;
  const instance = await workflowService.startWorkflow(
    definitionSlug,
    resourceType,
    resourceId,
    req.user!.userId,
    metadata || {},
  );
  sendCreated(res, instance, 'Workflow started');
};

export const transitionWorkflow = async (req: Request, res: Response) => {
  const { toState, note } = req.body;
  const instance = await workflowService.transition(
    req.params['id'] as string,
    toState,
    req.user!.userId,
    note || null,
  );
  sendSuccess(res, instance, 'Transition applied');
};

export const getPendingInstances = async (req: Request, res: Response) => {
  const { page, limit, definitionSlug } = req.query as Record<string, string | undefined>;
  const result = await workflowService.getPendingInstances({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    definitionSlug,
  });
  sendPaginated(res, result.instances, result.meta, 'Pending workflows');
};

export const getWorkflowInstance = async (req: Request, res: Response) => {
  const instance = await workflowService.getInstance(req.params['id'] as string);
  sendSuccess(res, instance);
};

export const getAvailableTransitions = async (req: Request, res: Response) => {
  const transitions = await workflowService.getAvailableTransitions(req.params['id'] as string);
  sendSuccess(res, transitions);
};

export const getWorkflowStats = async (_req: Request, res: Response) => {
  const stats = await workflowService.getStats();
  sendSuccess(res, stats);
};
