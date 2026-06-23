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
  status: z.enum(["new", "contacted", "interested", "negotiating", "converted", "lost"]).optional(),
  lostReason: z.string().max(500).trim().optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(2000).trim().optional(),
  followUpAt: z.string().optional(),
  exhibitionId: commonSchemas.objectId.optional(),
}));
