import { Request, Response } from 'express';
import { AdminUserService } from '../../../services/admin-user.service';
import { sendSuccess, sendPaginated, sendNoContent } from '../../../utils/api-response';

const adminUserService = new AdminUserService();

export const listUsers = async (req: Request, res: Response) => {
  const result = await adminUserService.getUsers(req.query as Record<string, unknown>);
  sendPaginated(res, result.users, result.meta, 'Users retrieved successfully');
};

export const createUser = async (req: Request, res: Response) => {
  const user = await adminUserService.createUser(req.body);
  sendSuccess(res, user, 'User created successfully', 201);
};

export const updateUser = async (req: Request, res: Response) => {
  const userId = req.params['userId'] as string;
  const callerId = req.user!.userId;
  const user = await adminUserService.updateUser(userId, callerId, req.body);
  sendSuccess(res, user, 'User updated successfully');
};

export const deleteUser = async (req: Request, res: Response) => {
  const userId = req.params['userId'] as string;
  const callerId = req.user!.userId;
  await adminUserService.deleteUser(userId, callerId);
  sendNoContent(res);
};

export const banUser = async (req: Request, res: Response) => {
  const userId = req.params['userId'] as string;
  const callerId = req.user!.userId;
  const user = await adminUserService.banUser(userId, callerId, req.body.reason);
  sendSuccess(res, user, 'User banned successfully');
};

export const unbanUser = async (req: Request, res: Response) => {
  const userId = req.params['userId'] as string;
  const user = await adminUserService.unbanUser(userId);
  sendSuccess(res, user, 'User unbanned successfully');
};
