import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IWorkflowHistoryEntry {
  fromState: string;
  toState: string;
  performedBy: Types.ObjectId;
  note: string | null;
  timestamp: Date;
}

export interface IWorkflowInstanceDoc extends Document {
  definitionId: Types.ObjectId;
  definitionSlug: string;
  resourceType: string;
  resourceId: string;
  currentState: string;
  isCompleted: boolean;
  history: IWorkflowHistoryEntry[];
  assignedTo: Types.ObjectId | null;
  metadata: Record<string, unknown>;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const historyEntrySchema = new Schema<IWorkflowHistoryEntry>(
  {
    fromState: { type: String, required: true },
    toState: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: null },
    timestamp: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const workflowInstanceSchema = new Schema<IWorkflowInstanceDoc>(
  {
    definitionId: { type: Schema.Types.ObjectId, ref: 'WorkflowDefinition', required: true },
    definitionSlug: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    currentState: { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    history: [historyEntrySchema],
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

workflowInstanceSchema.index({ definitionSlug: 1, isCompleted: 1, currentState: 1 });
workflowInstanceSchema.index({ resourceType: 1, resourceId: 1 });
workflowInstanceSchema.index({ assignedTo: 1, isCompleted: 1 });
workflowInstanceSchema.index({ createdBy: 1 });

export const WorkflowInstance = mongoose.model<IWorkflowInstanceDoc>(
  'WorkflowInstance',
  workflowInstanceSchema,
);
