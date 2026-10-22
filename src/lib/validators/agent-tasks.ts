import { z } from "zod";

/** Accepts an ISO datetime, a date-only string, or a Date; treats "" as omitted. */
const dueDateField = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.date(),
);

/** A picked record's id; "" (nothing picked) is treated as omitted. */
const recordIdField = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().regex(/^[a-f\d]{24}$/i, "Pick the record from the list").optional(),
);

export const agentTaskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  category: z.enum(["follow_up", "call", "meeting", "document", "other"]).default("follow_up"),
  dueDate: dueDateField.optional(),
  // The candidate, job and/or employer the task is about (all optional).
  candidateId: recordIdField,
  jobId: recordIdField,
  employerId: recordIdField,
});

/** The record kinds a task can link to, as the picker endpoint names them. */
export const taskLinkTypeSchema = z.enum(["candidate", "job", "employer"]);

export const agentTaskUpdateSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]).optional(),
  category: z.enum(["follow_up", "call", "meeting", "document", "other"]).optional(),
  dueDate: dueDateField.nullable().optional(),
});

/** Optional note left with a Completed / Failed change; on an assigned task, what the reviewer reads. */
export const agentTaskCompleteSchema = z.object({
  completionNote: z.string().trim().max(2000).optional(),
});

/** A super agent or admin gives an agent a task. `agentUserId` is the agent's user id. */
export const assignedTaskCreateSchema = z.object({
  agentUserId: z.string().min(1, "Choose an agent"),
  /** Admin only: give the task through this super agent (the agent must be on their team). */
  superAgentUserId: z.string().trim().optional(),
  title: z.string().min(1, "Title is required").max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  // Picker sends the assigner's local midnight, which is never more than 24h behind "now".
  dueDate: dueDateField
    .refine((d) => d.getTime() >= Date.now() - 24 * 60 * 60 * 1000, "Due date can't be in the past")
    .optional(),
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
