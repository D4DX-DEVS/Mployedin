import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

const approverSchema = z.object({
  userId: z.string().regex(objectIdRegex, "Invalid userId"),
  name: z.string().min(1).max(200),
  email: z.string().email(),
});

export const approvalWorkflowCreateSchema = z.object({
  type: z.string().min(1).max(50),
  resourceId: z.string().regex(objectIdRegex, "Invalid resourceId"),
  resourceTitle: z.string().min(1).max(300).trim(),
  requestedByName: z.string().max(200).optional().default(""),
  approvers: z.array(approverSchema).min(1).max(10),
  isSequential: z.boolean().default(true),
  requiredApprovals: z.number().int().min(1).max(10).default(1),
  deadline: z.string().datetime().optional(),
  notes: z.string().max(2000).trim().optional(),
});

export const approvalWorkflowDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comments: z.string().max(2000).trim().optional(),
});
