import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { sendSuccess } from '../../utils/api-response';

const analyticsService = new AnalyticsService();

export const getDashboard = async (_req: Request, res: Response) => {
  const [kpis, ordersByStatus, topProducts] = await Promise.all([
    analyticsService.getKPIs(),
    analyticsService.getOrdersByStatus(),
    analyticsService.getTopSellingProducts(10),
  ]);
  sendSuccess(res, { kpis, ordersByStatus, topProducts });
};

export const getRevenueChart = async (req: Request, res: Response) => {
  const period = (req.query.period as string) || 'daily';
  const days = parseInt((req.query.days as string) || '30', 10);
  const data = await analyticsService.getRevenueTimeSeries(period as any, days);
  sendSuccess(res, data);
};

export const getCustomerAcquisition = async (req: Request, res: Response) => {
  const days = parseInt((req.query.days as string) || '30', 10);
  const data = await analyticsService.getCustomerAcquisition(days);
  sendSuccess(res, data);
};

export const getConversionFunnel = async (_req: Request, res: Response) => {
  const data = await analyticsService.getConversionFunnel();
  sendSuccess(res, data);
};
