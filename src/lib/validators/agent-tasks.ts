import { z } from "zod";

/** Accepts an ISO datetime, a date-only string, or a Date; treats "" as omitted. */
const dueDateField = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.date(),
);

/**
 * A due date can't be in the past. The picker sends the user's local midnight,
 * which is never more than 24h behind "now", so today stays pickable in every
 * time zone.
 */
const futureDueDate = dueDateField.refine(
  (d) => d.getTime() >= Date.now() - 24 * 60 * 60 * 1000,
  "Due date can't be in the past",
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
  dueDate: futureDueDate.optional(),
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
  dueDate: futureDueDate.nullable().optional(),
});

/** Optional note left with a Completed / Failed change; on an assigned task, what the reviewer reads. */
export const agentTaskCompleteSchema = z.object({
  completionNote: z.string().trim().max(2000).optional(),
});

const userIdField = z.string().regex(/^[a-f\d]{24}$/i, "Choose someone from the list");

/**
 * A super agent or admin gives a task to one or many people. Admin may give it
 * to super agents (`assigneeRole: "super_agent"`) or agents; a super agent only
 * to agents on their team (checked in lib/agentTasks/assigned.ts). Each person
 * gets their own copy. `agentUserId` is the single-agent form older callers send.
 */
export const assignedTaskCreateSchema = z
  .object({
    assigneeRole: z.enum(["agent", "super_agent"]).default("agent"),
    assigneeUserIds: z.array(userIdField).max(100, "Pick 100 people or fewer").optional(),
    agentUserId: z.string().trim().optional(),
    /** Admin only: give agent tasks through this super agent (the agents must be on their team). */
    superAgentUserId: z.string().trim().optional(),
    title: z.string().min(1, "Title is required").max(200).trim(),
    description: z.string().max(2000).trim().optional(),
    priority: z.enum(["high", "medium", "low"]).default("medium"),
    /** Whether the giver checks the work before it closes. On unless switched off. */
    reviewRequired: z.boolean().default(true),
    // The record(s) the task is about, checked against what each person may open.
    candidateId: recordIdField,
    jobId: recordIdField,
    employerId: recordIdField,
    dueDate: futureDueDate.optional(),
  })
  .transform(({ agentUserId, assigneeUserIds, ...rest }) => ({
    ...rest,
    assigneeUserIds: [...new Set((assigneeUserIds?.length ? assigneeUserIds : agentUserId ? [agentUserId] : []).map(String))],
  }))
  .refine((v) => v.assigneeUserIds.length > 0, { message: "Choose who the task is for", path: ["assigneeUserIds"] });

/**
 * What a giver (or admin) can do to a task they gave. `scope: "group"` applies
 * it to every open copy of a task given to several people.
 */
export const taskActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("withdraw"), scope: z.enum(["one", "group"]).default("one"), note: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("reassign"), toUserId: userIdField, note: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("set_due"), scope: z.enum(["one", "group"]).default("one"), dueDate: futureDueDate.nullable() }),
  z.object({ action: z.literal("set_review"), scope: z.enum(["one", "group"]).default("one"), reviewRequired: z.boolean() }),
]);
export type TaskActionInput = z.infer<typeof taskActionSchema>;

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
