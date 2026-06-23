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
