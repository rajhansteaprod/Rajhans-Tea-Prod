import { Request, Response } from 'express';
import { AdminUserService } from '../../../services/admin-user.service';
import { sendPaginated } from '../../../utils/api-response';

const adminUserService = new AdminUserService();

export const listUsers = async (req: Request, res: Response) => {
  const result = await adminUserService.getUsers(req.query as Record<string, unknown>);
  sendPaginated(res, result.users, result.meta, 'Users retrieved successfully');
};
