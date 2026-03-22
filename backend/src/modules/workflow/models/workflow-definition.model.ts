import mongoose, { Document, Schema } from 'mongoose';

export interface ITransitionRule {
  from: string;
  to: string;
  requiredRole: string;
  label: string;
}

export interface IWorkflowDefinitionDoc extends Document {
  name: string;
  slug: string;
  description: string;
  states: string[];
  transitions: ITransitionRule[];
  initialState: string;
  finalStates: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const transitionRuleSchema = new Schema<ITransitionRule>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    requiredRole: { type: String, default: 'admin' },
    label: { type: String, required: true },
  },
  { _id: false },
);

const workflowDefinitionSchema = new Schema<IWorkflowDefinitionDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    states: [{ type: String }],
    transitions: [transitionRuleSchema],
    initialState: { type: String, required: true },
    finalStates: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

workflowDefinitionSchema.index({ slug: 1 }, { unique: true });

export const WorkflowDefinition = mongoose.model<IWorkflowDefinitionDoc>(
  'WorkflowDefinition',
  workflowDefinitionSchema,
);
