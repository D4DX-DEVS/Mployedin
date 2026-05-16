import { z } from "zod";
import { commonSchemas } from "./index";

/** POST /api/super-agent/actions/send-reminder */
export const sendReminderSchema = z.object({
  agentUserIds: z.array(z.string().min(1).max(50)).min(1).max(10),
  message: z.string().max(500).trim().optional(),
});

/** PATCH /api/super-agent/approvals/[id] */
export const approvalDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().max(500).trim().optional(),
});

/** POST /api/super-agent/actions/assign-leads */
export const assignLeadsSchema = z.object({
  fromAgentUserId: commonSchemas.objectId,
  toAgentUserId: commonSchemas.objectId,
  maxLeads: z.number().int().min(1).max(20).default(5),
});

/** PATCH /api/super-agent/agents/[id] — SA updates agent profile */
export const saAgentUpdateSchema = z.object({
  assignedCityIds: z.array(commonSchemas.objectId).max(200).optional(),
  assignedStateIds: z.array(commonSchemas.objectId).max(200).optional(),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workingDays: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).max(7).optional(),
  isActive: z.boolean().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
});

/** POST /api/super-agent/insights/feedback */
export const insightFeedbackSchema = z.object({
  insightTitle: z.string().max(200).trim(),
  insightSeverity: z.string().max(20).trim(),
  insightType: z.string().max(20).trim(),
  helpful: z.boolean(),
});
