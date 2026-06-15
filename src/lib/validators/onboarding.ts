import { z } from "zod";

/** Validators for post-hire onboarding checklists (FG-1). */

const taskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  assignee: z.string().trim().max(120).optional(),
  dueDate: z.string().datetime().optional().or(z.literal("")),
});

export const onboardingCreateSchema = z.object({
  tasks: z.array(taskSchema).max(50).optional(),
  startDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const onboardingUpdateSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
  startDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  // Add a task
  addTask: taskSchema.optional(),
  // Toggle / edit an existing task by index
  task: z
    .object({
      index: z.number().int().min(0).max(49),
      completed: z.boolean().optional(),
      title: z.string().trim().min(2).max(160).optional(),
      assignee: z.string().trim().max(120).optional(),
      dueDate: z.string().datetime().optional().or(z.literal("")),
      remove: z.boolean().optional(),
    })
    .optional(),
  // Add a document reference
  addDocument: z
    .object({
      name: z.string().trim().min(1).max(200),
      url: z.string().trim().url().max(2000).optional(),
    })
    .optional(),
  // Remove a document by index
  removeDocumentIndex: z.number().int().min(0).max(99).optional(),
});
