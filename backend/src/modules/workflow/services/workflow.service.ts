import { Types } from 'mongoose';
import { WorkflowDefinition, IWorkflowDefinitionDoc } from '../models/workflow-definition.model';
import { WorkflowInstance, IWorkflowInstanceDoc } from '../models/workflow-instance.model';
import { User } from '../../auth/models/user.model';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../../utils/api-error';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';
import { slugify } from '../../../utils/slugify';
import { logger } from '../../../utils/logger';

export class WorkflowService {
  // ─── Definition CRUD ──────────────────────────────────────────────────────

  async createDefinition(data: Partial<IWorkflowDefinitionDoc>) {
    if (!data.slug && data.name) data.slug = slugify(data.name);
    return WorkflowDefinition.create(data);
  }

  async updateDefinition(id: string, data: Partial<IWorkflowDefinitionDoc>) {
    const def = await WorkflowDefinition.findById(id).exec();
    if (!def) throw new NotFoundError('Workflow definition not found');
    return WorkflowDefinition.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async deleteDefinition(id: string) {
    await WorkflowDefinition.findByIdAndDelete(id).exec();
  }

  async listDefinitions() {
    return WorkflowDefinition.find().sort({ name: 1 }).exec();
  }

  async getDefinition(id: string) {
    const def = await WorkflowDefinition.findById(id).exec();
    if (!def) throw new NotFoundError('Workflow definition not found');
    return def;
  }

  async getDefinitionBySlug(slug: string) {
    const def = await WorkflowDefinition.findOne({ slug, isActive: true }).exec();
    if (!def) throw new NotFoundError('Workflow not found');
    return def;
  }

  // ─── Instance Lifecycle ───────────────────────────────────────────────────

  async startWorkflow(
    definitionSlug: string,
    resourceType: string,
    resourceId: string,
    createdByUserId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<IWorkflowInstanceDoc> {
    const def = await this.getDefinitionBySlug(definitionSlug);

    const instance = await WorkflowInstance.create({
      definitionId: def._id,
      definitionSlug: def.slug,
      resourceType,
      resourceId,
      currentState: def.initialState,
      isCompleted: false,
      history: [{
        fromState: '_start',
        toState: def.initialState,
        performedBy: new Types.ObjectId(createdByUserId),
        note: 'Workflow started',
        timestamp: new Date(),
      }],
      metadata,
      createdBy: new Types.ObjectId(createdByUserId),
    });

    logger.info({ definitionSlug, resourceType, resourceId, instanceId: instance._id }, 'Workflow started');
    return instance;
  }

  async transition(
    instanceId: string,
    toState: string,
    userId: string,
    note: string | null = null,
  ): Promise<IWorkflowInstanceDoc> {
    const instance = await WorkflowInstance.findById(instanceId).exec();
    if (!instance) throw new NotFoundError('Workflow instance not found');
    if (instance.isCompleted) throw new BadRequestError('Workflow already completed');

    const def = await WorkflowDefinition.findById(instance.definitionId).exec();
    if (!def) throw new NotFoundError('Workflow definition not found');

    // Validate transition
    const rule = def.transitions.find(
      (t) => t.from === instance.currentState && t.to === toState,
    );
    if (!rule) {
      throw new BadRequestError(`Invalid transition from "${instance.currentState}" to "${toState}"`);
    }

    // Validate role
    const user = await User.findById(userId).select('role').exec();
    if (!user) throw new NotFoundError('User not found');
    if (rule.requiredRole && user.role !== rule.requiredRole && user.role !== 'admin') {
      throw new ForbiddenError(`Role "${rule.requiredRole}" required for this transition`);
    }

    const fromState = instance.currentState;
    instance.currentState = toState;
    instance.isCompleted = def.finalStates.includes(toState);
    instance.history.push({
      fromState,
      toState,
      performedBy: new Types.ObjectId(userId),
      note,
      timestamp: new Date(),
    });

    await instance.save();

    logger.info({ instanceId, fromState, toState, userId }, 'Workflow transition');
    return instance;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getPendingInstances(query: { page?: number; limit?: number; definitionSlug?: string } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = { isCompleted: false };
    if (query.definitionSlug) filter.definitionSlug = query.definitionSlug;

    const [instances, total] = await Promise.all([
      WorkflowInstance.find(filter)
        .populate('createdBy', 'phone firstName lastName')
        .populate('assignedTo', 'phone firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      WorkflowInstance.countDocuments(filter).exec(),
    ]);
    return { instances, meta: buildPaginationMeta(page, limit, total) };
  }

  async getInstance(id: string) {
    const instance = await WorkflowInstance.findById(id)
      .populate('createdBy', 'phone firstName lastName')
      .populate('assignedTo', 'phone firstName lastName')
      .populate('history.performedBy', 'phone firstName lastName')
      .exec();
    if (!instance) throw new NotFoundError('Workflow instance not found');
    return instance;
  }

  async getInstancesByResource(resourceType: string, resourceId: string) {
    return WorkflowInstance.find({ resourceType, resourceId })
      .populate('createdBy', 'phone firstName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async assignTo(instanceId: string, assignToUserId: string) {
    await WorkflowInstance.findByIdAndUpdate(instanceId, {
      $set: { assignedTo: new Types.ObjectId(assignToUserId) },
    }).exec();
  }

  async getStats() {
    const [total, pending, completed, byDefinition] = await Promise.all([
      WorkflowInstance.countDocuments().exec(),
      WorkflowInstance.countDocuments({ isCompleted: false }).exec(),
      WorkflowInstance.countDocuments({ isCompleted: true }).exec(),
      WorkflowInstance.aggregate([
        { $group: { _id: '$definitionSlug', total: { $sum: 1 }, pending: { $sum: { $cond: ['$isCompleted', 0, 1] } } } },
      ]).exec(),
    ]);
    return { total, pending, completed, byDefinition };
  }

  async getAvailableTransitions(instanceId: string): Promise<{ to: string; label: string; requiredRole: string }[]> {
    const instance = await WorkflowInstance.findById(instanceId).exec();
    if (!instance || instance.isCompleted) return [];

    const def = await WorkflowDefinition.findById(instance.definitionId).exec();
    if (!def) return [];

    return def.transitions
      .filter((t) => t.from === instance.currentState)
      .map((t) => ({ to: t.to, label: t.label, requiredRole: t.requiredRole }));
  }
}
