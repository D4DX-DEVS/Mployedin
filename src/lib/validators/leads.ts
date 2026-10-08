import { z } from "zod";
import { commonSchemas } from "./index";

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

/** Statuses a PATCH / bulk move may set. "converted" is reserved for the convert route. */
export const LEAD_EDITABLE_STATUSES = ["new", "contacted", "interested", "negotiating", "lost"] as const;

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
  // "converted" is not settable here (LD-1): only POST /api/leads/[id]/convert
  // may convert, because it is what creates the employer account.
  status: z.enum(LEAD_EDITABLE_STATUSES).optional(),
  lostReason: z.string().max(500).trim().optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(2000).trim().optional(),
  followUpAt: z.string().optional(),
  exhibitionId: commonSchemas.objectId.optional(),
}));

/** Optional overrides for POST /api/leads/[id]/convert (LD-4). */
export const leadConvertSchema = z.preprocess(stripEmptyStrings, z.object({
  contactEmail: commonSchemas.email.optional(),
  contactPerson: z.string().min(2).max(100).trim().optional(),
  companyName: z.string().min(2).max(200).trim().optional(),
  contactPhone: commonSchemas.phone.optional(),
  industry: z.string().max(100).trim().optional(),
  country: z.string().max(100).trim().optional(),
}));
