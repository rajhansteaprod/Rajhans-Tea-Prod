import { Request, Response } from 'express';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { sendSuccess } from '../../utils/api-response';

const dashboardService = new AdminDashboardService();

export const getDashboardStats = async (_req: Request, res: Response) => {
  const result = await dashboardService.getStats();
  sendSuccess(res, result, 'Dashboard stats retrieved');
};
