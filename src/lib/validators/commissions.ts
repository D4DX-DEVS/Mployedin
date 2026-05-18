import { z } from "zod";
import { commonSchemas } from "./index";

export const commissionCreateSchema = z.object({
  type: z.enum(["placement", "override", "bonus"]),
  amount: z.number().min(0),
  currency: z.string().length(3).default("AED"),
  rate: z.number().min(0).max(100).optional(),
  agentId: commonSchemas.objectId.optional(),
  superAgentId: commonSchemas.objectId.optional(),
  placementId: commonSchemas.objectId.optional(),
  notes: z.string().max(2000).trim().optional(),
});

export const commissionUpdateSchema = z.object({
  type: z.enum(["placement", "override", "bonus"]).optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  rate: z.number().min(0).max(100).optional(),
  status: z.enum(["pending", "approved", "paid", "disputed", "clawed_back"]).optional(),
  notes: z.string().max(2000).trim().optional(),
  paymentRef: z.string().max(200).optional(),
  // Dispute
  disputeReason: z.string().max(1000).trim().optional(),
  disputeResolution: z.enum(["resolved", "rejected", "escalated"]).optional(),
  // Clawback
  clawbackAmount: z.number().min(0).optional(),
  clawbackReason: z.string().max(1000).trim().optional(),
});
