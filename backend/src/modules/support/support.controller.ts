import { Request, Response } from 'express';
import { TicketService } from './services/ticket.service';
import { sendSuccess, sendCreated, sendPaginated } from '../../utils/api-response';

const ticketService = new TicketService();

// Customer
export const createTicket = async (req: Request, res: Response) => {
  const ticket = await ticketService.createTicket(req.user!.userId, req.body);
  sendCreated(res, ticket, 'Ticket created');
};

export const getMyTickets = async (req: Request, res: Response) => {
  const { page, limit } = req.query as Record<string, string | undefined>;
  const result = await ticketService.getUserTickets(req.user!.userId, {
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  sendPaginated(res, result.tickets, result.meta, 'Tickets');
};

export const getMyTicket = async (req: Request, res: Response) => {
  const ticket = await ticketService.getTicketForUser(req.params['id'] as string, req.user!.userId);
  sendSuccess(res, ticket);
};

export const replyToTicket = async (req: Request, res: Response) => {
  const ticket = await ticketService.addUserMessage(
    req.params['id'] as string,
    req.user!.userId,
    req.body.body,
  );
  sendSuccess(res, ticket, 'Reply sent');
};

// Admin
export const adminListTickets = async (req: Request, res: Response) => {
  const { page, limit, status, priority } = req.query as Record<string, string | undefined>;
  const result = await ticketService.adminListTickets({
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    status,
    priority,
  });
  sendPaginated(res, result.tickets, result.meta, 'Tickets');
};

export const adminGetTicket = async (req: Request, res: Response) => {
  const ticket = await ticketService.adminGetTicket(req.params['id'] as string);
  sendSuccess(res, ticket);
};

export const adminReply = async (req: Request, res: Response) => {
  const ticket = await ticketService.adminReply(
    req.params['id'] as string,
    req.user!.userId,
    req.body.body,
  );
  sendSuccess(res, ticket, 'Reply sent');
};

export const adminUpdateStatus = async (req: Request, res: Response) => {
  const ticket = await ticketService.adminUpdateStatus(req.params['id'] as string, req.body.status);
  sendSuccess(res, ticket, 'Status updated');
};

export const adminGetStats = async (_req: Request, res: Response) => {
  const stats = await ticketService.getStats();
  sendSuccess(res, stats);
};
