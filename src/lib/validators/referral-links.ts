import { z } from "zod";

/** POST /api/referral-links */
export const referralLinkCreateSchema = z.object({
  label: z.string().max(100).trim().optional().default(""),
  maxUses: z.coerce.number().int().min(0).default(0),
  expiresAt: z.string().max(50).optional(),
});

/** PATCH /api/referral-links/[id] */
export const referralLinkUpdateSchema = z.object({
  label: z.string().max(100).trim().optional(),
  isActive: z.boolean().optional(),
  maxUses: z.coerce.number().int().min(0).optional(),
  expiresAt: z.string().max(50).nullable().optional(),
});
