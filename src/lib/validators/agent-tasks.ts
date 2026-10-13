import { z } from "zod";

/** Accepts an ISO datetime, a date-only string, or a Date; treats "" as omitted. */
const dueDateField = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.date(),
);

export const agentTaskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  category: z.enum(["follow_up", "call", "meeting", "document", "other"]).default("follow_up"),
  dueDate: dueDateField.optional(),
});

export const agentTaskUpdateSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
  category: z.enum(["follow_up", "call", "meeting", "document", "other"]).optional(),
  dueDate: dueDateField.nullable().optional(),
});

/** Agent submits an assigned task as done; the note is what the reviewer reads. */
export const agentTaskCompleteSchema = z.object({
  completionNote: z.string().trim().min(1, "Add a short note on what you did").max(2000),
});

/** A super agent or admin gives an agent a task. `agentUserId` is the agent's user id. */
export const assignedTaskCreateSchema = z.object({
  agentUserId: z.string().min(1, "Choose an agent"),
  title: z.string().min(1, "Title is required").max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  dueDate: dueDateField.optional(),
});

/** Approve, or send back with a comment saying what needs to change. */
export const taskReviewSchema = z
  .object({
    action: z.enum(["approve", "return"]),
    reviewComment: z.string().max(2000).trim().optional(),
  })
  .refine((v) => v.action === "approve" || Boolean(v.reviewComment), {
    message: "Say what needs to change",
    path: ["reviewComment"],
  });
