import { z } from "zod";
import { commonSchemas } from "./index";

export const leadCreateSchema = z.object({
  companyName: z.string().min(2).max(200).trim(),
  contactPerson: z.string().min(2).max(100).trim(),
  contactEmail: commonSchemas.email.optional(),
  contactPhone: commonSchemas.phone.optional(),
  country: z.string().max(100).trim().optional(),
  industry: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(2000).trim().optional(),
  followUpAt: z.string().optional(),
});

export const leadUpdateSchema = z.object({
  companyName: z.string().min(2).max(200).trim().optional(),
  contactPerson: z.string().min(2).max(100).trim().optional(),
  contactEmail: commonSchemas.email.optional(),
  contactPhone: commonSchemas.phone.optional(),
  country: z.string().max(100).trim().optional(),
  industry: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  status: z.enum(["new", "contacted", "interested", "negotiating", "converted", "lost"]).optional(),
  notes: z.string().max(2000).trim().optional(),
  followUpAt: z.string().optional(),
});
