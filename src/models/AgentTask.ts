import mongoose, { Schema, type Model } from "mongoose";

/**
 * An agent's own to-do list — follow-ups, calls, meetings, document chases.
 *
 * The schema used to be declared inline inside `/api/agent/tasks/route.ts`,
 * which made it private to that one file: the nav badge and the dashboard
 * queue could not count overdue tasks without redeclaring the model and
 * risking a second registration under the same name. It lives here now so
 * every reader shares one definition.
 */
export type AgentTaskPriority = "high" | "medium" | "low";
export type AgentTaskStatus = "pending" | "in_progress" | "completed";
export type AgentTaskCategory = "follow_up" | "call" | "meeting" | "document" | "other";

export interface IAgentTask {
  userId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  priority: AgentTaskPriority;
  status: AgentTaskStatus;
  dueDate?: Date;
  category: AgentTaskCategory;
  relatedTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgentTaskSchema = new Schema<IAgentTask>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    description: String,
    priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    status: { type: String, enum: ["pending", "in_progress", "completed"], default: "pending" },
    dueDate: Date,
    category: {
      type: String,
      enum: ["follow_up", "call", "meeting", "document", "other"],
      default: "follow_up",
    },
    relatedTo: String,
  },
  { timestamps: true },
);

// The overdue count and the calendar both query by owner and due date.
AgentTaskSchema.index({ userId: 1, dueDate: 1, status: 1 });

const AgentTask: Model<IAgentTask> =
  (mongoose.models.AgentTask as Model<IAgentTask>) ||
  mongoose.model<IAgentTask>("AgentTask", AgentTaskSchema);

export default AgentTask;
