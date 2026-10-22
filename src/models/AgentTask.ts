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
export type AgentTaskStatus = "pending" | "in_progress" | "completed" | "failed";

/** Statuses that close a task: no longer open, never overdue. */
export const CLOSED_TASK_STATUSES: AgentTaskStatus[] = ["completed", "failed"];
export type AgentTaskCategory = "follow_up" | "call" | "meeting" | "document" | "other";

export type AgentTaskReviewStatus = "none" | "awaiting_review" | "approved" | "returned";

/** One line of a task's activity: who changed what, when, and their optional note. */
export type AgentTaskHistoryAction = "created" | "assigned" | "status" | "submitted" | "approved" | "returned";

export interface IAgentTaskHistoryEntry {
  action: AgentTaskHistoryAction;
  from?: AgentTaskStatus;
  to?: AgentTaskStatus;
  note?: string;
  by: mongoose.Types.ObjectId;
  at: Date;
}

/**
 * The records a task is about, picked from the database when it is created —
 * so "follow up with Sara about the driver job" opens Sara's application
 * instead of only having a status to change. Each id is checked against what
 * the agent may see when it is saved (lib/agentTasks/links.ts).
 */
export interface IAgentTaskLinks {
  /** JobSeeker profile _id. */
  candidateId?: mongoose.Types.ObjectId;
  jobId?: mongoose.Types.ObjectId;
  /** Employer profile _id (not the employer's user id). */
  employerId?: mongoose.Types.ObjectId;
}

export interface IAgentTask {
  userId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  priority: AgentTaskPriority;
  status: AgentTaskStatus;
  dueDate?: Date;
  category: AgentTaskCategory;
  relatedTo?: string;
  links?: IAgentTaskLinks;
  /* Assignment & review fields — personal tasks have null/defaults */
  assignedBy?: {
    userId: mongoose.Types.ObjectId;
    role: "super_agent" | "admin";
    assignedAt: Date;
  };
  /** An admin's task given through a super agent: that super agent (user id) manages and may review it. */
  managedBy?: mongoose.Types.ObjectId;
  reviewStatus: AgentTaskReviewStatus;
  completionNote?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewComment?: string;
  history?: IAgentTaskHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const AgentTaskSchema = new Schema<IAgentTask>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    description: String,
    priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
    dueDate: Date,
    category: {
      type: String,
      enum: ["follow_up", "call", "meeting", "document", "other"],
      default: "follow_up",
    },
    relatedTo: String,
    links: {
      type: new Schema<IAgentTaskLinks>(
        {
          candidateId: { type: Schema.Types.ObjectId, ref: "JobSeeker" },
          jobId: { type: Schema.Types.ObjectId, ref: "Job" },
          employerId: { type: Schema.Types.ObjectId, ref: "Employer" },
        },
        { _id: false },
      ),
      default: undefined,
    },
    assignedBy: {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      role: { type: String, enum: ["super_agent", "admin"] },
      assignedAt: Date,
    },
    managedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewStatus: {
      type: String,
      enum: ["none", "awaiting_review", "approved", "returned"],
      default: "none",
    },
    // The optional note left with the last Completed / Failed change; on an
    // assigned task, what the reviewer reads.
    completionNote: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewComment: String,
    // Newest last, capped (pushHistory) so a long-lived task can't grow unbounded.
    history: {
      type: [
        new Schema<IAgentTaskHistoryEntry>(
          {
            action: { type: String, enum: ["created", "assigned", "status", "submitted", "approved", "returned"], required: true },
            from: { type: String, enum: ["pending", "in_progress", "completed", "failed"] },
            to: { type: String, enum: ["pending", "in_progress", "completed", "failed"] },
            note: String,
            by: { type: Schema.Types.ObjectId, ref: "User", required: true },
            at: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
  },
  { timestamps: true },
);

// The overdue count and the calendar both query by owner and due date.
AgentTaskSchema.index({ userId: 1, dueDate: 1, status: 1 });

const AgentTask: Model<IAgentTask> =
  (mongoose.models.AgentTask as Model<IAgentTask>) ||
  mongoose.model<IAgentTask>("AgentTask", AgentTaskSchema);

export default AgentTask;
