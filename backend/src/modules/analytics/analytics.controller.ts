import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { IntelligenceService } from './intelligence.service';
import { ExportService } from './export.service';
import { sendSuccess } from '../../utils/api-response';

const analyticsService = new AnalyticsService();
const intelligenceService = new IntelligenceService();
const exportService = new ExportService();

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

// ─── Intelligence (Slice 14) ─────────────────────────────────────────────────

export const getUserSegmentation = async (_req: Request, res: Response) => {
  const data = await intelligenceService.getUserSegmentation();
  sendSuccess(res, data);
};

export const getRevenueForecast = async (req: Request, res: Response) => {
  const days = parseInt((req.query.days as string) || '7', 10);
  const data = await intelligenceService.getRevenueForecast(days);
  sendSuccess(res, data);
};

export const getKPIComparison = async (_req: Request, res: Response) => {
  const data = await intelligenceService.getKPIComparison();
  sendSuccess(res, data);
};

export const getProductPerformance = async (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const data = await intelligenceService.getProductPerformance(limit);
  sendSuccess(res, data);
};

export const getChurnRisk = async (_req: Request, res: Response) => {
  const data = await intelligenceService.getChurnRiskUsers();
  sendSuccess(res, data);
};

export const getCohortAnalysis = async (_req: Request, res: Response) => {
  const data = await intelligenceService.getCohortAnalysis();
  sendSuccess(res, data);
};

export const getRealTimeStats = async (_req: Request, res: Response) => {
  const data = await intelligenceService.getRealTimeStats();
  sendSuccess(res, data);
};

// ─── CSV Exports ─────────────────────────────────────────────────────────────

export const exportOrders = async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  const csv = await exportService.exportOrdersCsv(startDate, endDate);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
  res.send(csv);
};

export const exportUsers = async (_req: Request, res: Response) => {
  const csv = await exportService.exportUsersCsv();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
  res.send(csv);
};

export const exportProducts = async (_req: Request, res: Response) => {
  const csv = await exportService.exportProductsCsv();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=products.csv');
  res.send(csv);
};
