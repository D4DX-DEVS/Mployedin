import { z } from "zod";
import { commonSchemas } from "./index";

export const leadCreateSchema = z.object({
  companyName: z.string().min(2).max(200).trim(),
  contactName: z.string().min(2).max(100).trim(),
  email: commonSchemas.email.optional(),
  phone: commonSchemas.phone.optional(),
  industry: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(2000).trim().optional(),
});

export const leadUpdateSchema = z.object({
  companyName: z.string().min(2).max(200).trim().optional(),
  contactName: z.string().min(2).max(100).trim().optional(),
  email: commonSchemas.email.optional(),
  phone: commonSchemas.phone.optional(),
  status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
  notes: z.string().max(2000).trim().optional(),
  nextFollowUp: z.string().datetime().optional(),
});
