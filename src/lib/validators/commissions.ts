import { z } from "zod";

/** How a commission was paid out to the agent / super-agent. */
export const COMMISSION_PAYMENT_METHODS = ["bank_transfer", "cash", "cheque", "online", "other"] as const;

export const commissionUpdateSchema = z.object({
  type: z.enum(["placement", "override", "bonus"]).optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  rate: z.number().min(0).max(100).optional(),
  status: z.enum(["pending", "approved", "paid", "disputed", "clawed_back"]).optional(),
  notes: z.string().max(2000).trim().optional(),
  // Payout — recorded when the commission is marked paid
  paymentRef: z.string().max(200).trim().optional(),
  paymentMethod: z.enum(COMMISSION_PAYMENT_METHODS).optional(),
  /** Day the money was sent (YYYY-MM-DD); defaults to today, never in the future. */
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Dispute
  disputeReason: z.string().max(1000).trim().optional(),
  disputeResolution: z.enum(["resolved", "rejected", "escalated"]).optional(),
  // Clawback
  clawbackAmount: z.number().min(0).optional(),
  clawbackReason: z.string().max(1000).trim().optional(),
});
