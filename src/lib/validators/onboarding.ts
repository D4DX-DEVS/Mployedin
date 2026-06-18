import { z } from "zod";

/** Validators for post-hire onboarding checklists (FG-1). */

/** 24-char hex Mongo ObjectId. */
const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i, "Invalid ID");

const taskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  assignee: z.string().trim().max(120).optional(),
  assigneeUserId: objectId.optional().or(z.literal("")),
  dueDate: z.string().datetime().optional().or(z.literal("")),
});

export const onboardingCreateSchema = z.object({
  tasks: z.array(taskSchema).max(50).optional(),
  startDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Employer document operation: a plain reference, or a request to the candidate. */
const addDocumentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000).optional().or(z.literal("")),
  requestedFromCandidate: z.boolean().optional(),
  requiresSignature: z.boolean().optional(),
  dueDate: z.string().datetime().optional().or(z.literal("")),
});

/** Probation period tracking (employer-managed). */
const probationSchema = z.object({
  endDate: z.string().datetime().optional().or(z.literal("")),
  status: z.enum(["pending", "passed", "failed", "extended"]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const onboardingUpdateSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
  startDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  // Probation period
  probation: probationSchema.optional(),
  // Add a task
  addTask: taskSchema.optional(),
  // Toggle / edit an existing task by index
  task: z
    .object({
      index: z.number().int().min(0).max(49),
      completed: z.boolean().optional(),
      title: z.string().trim().min(2).max(160).optional(),
      assignee: z.string().trim().max(120).optional(),
      assigneeUserId: objectId.optional().or(z.literal("")),
      dueDate: z.string().datetime().optional().or(z.literal("")),
      remove: z.boolean().optional(),
    })
    .optional(),
  // Add a document reference (or request one from the candidate)
  addDocument: addDocumentSchema.optional(),
  // Update an existing document by index (employer side: mark approved, etc.)
  document: z
    .object({
      index: z.number().int().min(0).max(99),
      status: z.enum(["requested", "submitted", "signed", "approved"]).optional(),
    })
    .optional(),
  // Remove a document by index
  removeDocumentIndex: z.number().int().min(0).max(99).optional(),
});

/** Job seeker e-signs a requested document (typed-name acknowledgement). */
export const onboardingSignSchema = z.object({
  documentIndex: z.number().int().min(0).max(99),
  signatureName: z.string().trim().min(2).max(120),
});
