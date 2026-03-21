import { Request, Response } from 'express';
import { metricsCollector } from './services/metrics-collector';
import { sendSuccess } from '../../utils/api-response';

export const getObservabilityDashboard = async (_req: Request, res: Response) => {
  const [errorSummary, slowest, endpoints] = await Promise.all([
    metricsCollector.getErrorSummary(),
    metricsCollector.getSlowestEndpoints(10),
    metricsCollector.getEndpointOverview(),
  ]);

  sendSuccess(res, { errorSummary, slowest, endpoints });
};

export const getEndpointLatency = async (req: Request, res: Response) => {
  const endpoint = req.query.endpoint as string;
  if (!endpoint) {
    res.status(400).json({ success: false, message: 'endpoint query param required' });
    return;
  }
  const stats = await metricsCollector.getLatencyStats(endpoint);
  sendSuccess(res, stats);
};
