import { z } from "zod";
import { commonSchemas } from "./index";
import {
  CONTACT_METHODS,
  FOLLOW_UP_TYPES,
  HIRING_RANGES,
  LEAD_STAGES,
  LOST_REASONS,
} from "@/lib/leads/stageRules";

/** An ISO date string the server can actually parse. */
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid date" });

/**
 * Form payloads send empty strings ("") for blank optional fields, which fail
 * `.optional()` (it only allows `undefined`) and produce confusing 400s. Strip
 * blank strings to `undefined` before validation so optional fields are treated
 * as omitted.
 */
const stripEmptyStrings = (val: unknown): unknown => {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = typeof v === "string" && v.trim() === "" ? undefined : v;
    }
    return out;
  }
  return val;
};

export const leadCreateSchema = z.preprocess(stripEmptyStrings, z.object({
  companyName: z.string().min(2).max(200).trim(),
  contactPerson: z.string().min(2).max(100).trim(),
  contactEmail: commonSchemas.email.optional(),
  contactPhone: commonSchemas.phone.optional(),
  country: z.string().max(100).trim().optional(),
  city: z.string().max(100).trim().optional(),
  industry: z.string().max(100).optional(),
  expectedRevenue: z.number().min(0).optional(),
  expectedRevenueCurrency: z.string().length(3).optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(2000).trim().optional(),
  requirement: z.string().max(500).trim().optional(),
  expectedHiring: z.enum(HIRING_RANGES).optional(),
  followUpAt: z.string().optional(),
  exhibitionId: commonSchemas.objectId.optional(),
}));

export const leadUpdateSchema = z.preprocess(stripEmptyStrings, z.object({
  companyName: z.string().min(2).max(200).trim().optional(),
  contactPerson: z.string().min(2).max(100).trim().optional(),
  contactEmail: commonSchemas.email.optional(),
  contactPhone: commonSchemas.phone.optional(),
  country: z.string().max(100).trim().optional(),
  city: z.string().max(100).trim().optional(),
  industry: z.string().max(100).optional(),
  expectedRevenue: z.number().min(0).optional(),
  expectedRevenueCurrency: z.string().length(3).optional(),
  status: z.enum(["new", "contacted", "interested", "negotiating", "converted", "lost"]).optional(),
  lostReason: z.string().max(500).trim().optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(2000).trim().optional(),
  requirement: z.string().max(500).trim().optional(),
  expectedHiring: z.enum(HIRING_RANGES).optional(),
  followUpAt: z.string().optional(),
  exhibitionId: commonSchemas.objectId.optional(),
}));

/**
 * POST /api/leads/[id]/stage — a stage move plus the details the target stage
 * needs (see stageRules). Every detail is optional here; the route decides
 * which are required from the move and what the lead already holds.
 */
export const leadStageMoveSchema = z.preprocess(stripEmptyStrings, z.object({
  status: z.enum(LEAD_STAGES),
  contactMethod: z.enum(CONTACT_METHODS).optional(),
  contactedAt: isoDate.optional(),
  requirement: z.string().max(500).trim().optional(),
  expectedHiring: z.enum(HIRING_RANGES).optional(),
  expectedRevenue: z.number().min(0).optional(),
  followUpAt: isoDate.optional(),
  followUpType: z.enum(FOLLOW_UP_TYPES).optional(),
  followUpNote: z.string().max(200).trim().optional(),
  wonValue: z.number().min(0).optional(),
  wonAt: isoDate.optional(),
  lostReasonCode: z.enum(LOST_REASONS).optional(),
  note: z.string().max(2000).trim().optional(),
}));

/** PUT /api/leads/[id]/follow-up — schedule or reschedule the next follow-up. */
export const leadFollowUpSchema = z.preprocess(stripEmptyStrings, z.object({
  followUpAt: isoDate,
  followUpType: z.enum(FOLLOW_UP_TYPES).optional(),
  followUpNote: z.string().max(200).trim().optional(),
}));
