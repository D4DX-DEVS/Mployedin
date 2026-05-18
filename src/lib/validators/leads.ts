import { z } from "zod";
import { commonSchemas } from "./index";

export const leadCreateSchema = z.object({
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
});

export const leadUpdateSchema = z.object({
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
});
