import { Types } from 'mongoose';
import { Ticket, TicketStatus, TicketPriority } from '../models/ticket.model';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../../utils/api-error';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class TicketService {
  private async generateTicketNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;
    const last = await Ticket.findOne({ ticketNumber: { $regex: `^${prefix}` } })
      .sort({ ticketNumber: -1 }).select('ticketNumber').exec();
    let seq = 1;
    if (last) seq = parseInt(last.ticketNumber.replace(prefix, ''), 10) + 1;
    return `${prefix}${seq.toString().padStart(5, '0')}`;
  }

  // ─── Customer ─────────────────────────────────────────────────────────────

  async createTicket(userId: string, data: { subject: string; description: string; priority?: TicketPriority }) {
    const ticketNumber = await this.generateTicketNumber();
    return Ticket.create({
      ticketNumber,
      userId: new Types.ObjectId(userId),
      subject: data.subject,
      description: data.description,
      priority: data.priority || 'medium',
      messages: [{ body: data.description, senderType: 'user', senderId: new Types.ObjectId(userId), timestamp: new Date() }],
    });
  }

  async getUserTickets(userId: string, query: { page?: number; limit?: number } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { userId: new Types.ObjectId(userId) };
    const [tickets, total] = await Promise.all([
      Ticket.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Ticket.countDocuments(filter).exec(),
    ]);
    return { tickets, meta: buildPaginationMeta(page, limit, total) };
  }

  async getTicketForUser(ticketId: string, userId: string) {
    const ticket = await Ticket.findById(ticketId).populate('assignedTo', 'firstName phone').exec();
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (ticket.userId.toString() !== userId) throw new ForbiddenError('Access denied');
    return ticket;
  }

  async addUserMessage(ticketId: string, userId: string, body: string) {
    const ticket = await Ticket.findById(ticketId).exec();
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (ticket.userId.toString() !== userId) throw new ForbiddenError('Access denied');
    if (ticket.status === 'closed') throw new BadRequestError('Ticket is closed');

    ticket.messages.push({ body, senderType: 'user', senderId: new Types.ObjectId(userId), timestamp: new Date() });
    if (ticket.status === 'resolved') ticket.status = 'open'; // reopen on user reply
    return ticket.save();
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async adminListTickets(query: { page?: number; limit?: number; status?: string; priority?: string } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .populate('userId', 'phone firstName lastName')
        .populate('assignedTo', 'phone firstName')
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip).limit(limit).exec(),
      Ticket.countDocuments(filter).exec(),
    ]);
    return { tickets, meta: buildPaginationMeta(page, limit, total) };
  }

  async adminGetTicket(ticketId: string) {
    const ticket = await Ticket.findById(ticketId)
      .populate('userId', 'phone firstName lastName')
      .populate('assignedTo', 'phone firstName')
      .exec();
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }

  async adminReply(ticketId: string, adminId: string, body: string) {
    const ticket = await Ticket.findById(ticketId).exec();
    if (!ticket) throw new NotFoundError('Ticket not found');

    ticket.messages.push({ body, senderType: 'admin', senderId: new Types.ObjectId(adminId), timestamp: new Date() });
    if (ticket.status === 'open') ticket.status = 'in_progress';
    return ticket.save();
  }

  async adminUpdateStatus(ticketId: string, status: TicketStatus) {
    const ticket = await Ticket.findByIdAndUpdate(ticketId, { $set: { status } }, { new: true }).exec();
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }

  async adminUpdatePriority(ticketId: string, priority: TicketPriority) {
    return Ticket.findByIdAndUpdate(ticketId, { $set: { priority } }, { new: true }).exec();
  }

  async adminAssign(ticketId: string, adminId: string) {
    return Ticket.findByIdAndUpdate(ticketId, { $set: { assignedTo: new Types.ObjectId(adminId) } }, { new: true }).exec();
  }

  async getStats() {
    const [total, open, inProgress, resolved, urgent] = await Promise.all([
      Ticket.countDocuments().exec(),
      Ticket.countDocuments({ status: 'open' }).exec(),
      Ticket.countDocuments({ status: 'in_progress' }).exec(),
      Ticket.countDocuments({ status: 'resolved' }).exec(),
      Ticket.countDocuments({ priority: 'urgent', status: { $nin: ['resolved', 'closed'] } }).exec(),
    ]);
    return { total, open, inProgress, resolved, urgent };
  }
}
