import { Request, Response } from 'express';
import { ExperimentService } from './services/experiment.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/api-response';

const experimentService = new ExperimentService();

// Public — get assigned variants
export const getAssignedVariants = async (req: Request, res: Response) => {
  const sessionId = (req.headers['x-session-id'] as string) || '';
  const assignments = await experimentService.getActiveExperiments({
    userId: req.user?.userId,
    sessionId,
  });
  sendSuccess(res, assignments);
};

export const getVariant = async (req: Request, res: Response) => {
  const slug = req.params['slug'] as string;
  const sessionId = (req.headers['x-session-id'] as string) || '';
  const result = await experimentService.assignVariant(slug, {
    userId: req.user?.userId,
    sessionId,
  });
  sendSuccess(res, result || { variant: null, experiment: slug });
};

// Admin
export const listExperiments = async (_req: Request, res: Response) => {
  const experiments = await experimentService.listAll();
  sendSuccess(res, experiments);
};

export const createExperiment = async (req: Request, res: Response) => {
  const exp = await experimentService.create(req.body);
  sendCreated(res, exp, 'Experiment created');
};

export const updateExperiment = async (req: Request, res: Response) => {
  const exp = await experimentService.update(req.params['id'] as string, req.body);
  sendSuccess(res, exp, 'Experiment updated');
};

export const deleteExperiment = async (req: Request, res: Response) => {
  await experimentService.delete(req.params['id'] as string);
  sendNoContent(res);
};

export const startExperiment = async (req: Request, res: Response) => {
  const exp = await experimentService.start(req.params['id'] as string);
  sendSuccess(res, exp, 'Experiment started');
};

export const stopExperiment = async (req: Request, res: Response) => {
  const exp = await experimentService.stop(req.params['id'] as string);
  sendSuccess(res, exp, 'Experiment stopped');
};

export const getExperimentResults = async (req: Request, res: Response) => {
  const results = await experimentService.getResults(req.params['slug'] as string);
  sendSuccess(res, results);
};
