import { z } from "zod";

const objectIdRegex = /^[a-f\d]{24}$/i;

const fieldSchema = z.object({
  label: z.string().max(200).default(""),
  key: z.string().max(100).optional(),
  type: z.enum(["text", "textarea", "select", "multiselect", "checkbox", "radio", "number", "date", "file", "email", "phone", "url"]).default("text"),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  helpText: z.string().max(500).optional(),
  options: z.array(z.string().max(200)).max(20).optional(),
  order: z.number().int().min(0).optional(),
});

export const applicationFormCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  jobId: z.string().regex(objectIdRegex).optional(),
  fields: z.array(fieldSchema).max(30).default([]),
  isDefault: z.boolean().default(false),
  collectResume: z.boolean().default(true),
  collectCoverLetter: z.boolean().default(false),
  collectLinkedIn: z.boolean().default(false),
  collectPortfolio: z.boolean().default(false),
});

export const applicationFormUpdateSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().optional(),
  fields: z.array(fieldSchema).max(30).optional(),
  isDefault: z.boolean().optional(),
  collectResume: z.boolean().optional(),
  collectCoverLetter: z.boolean().optional(),
  collectLinkedIn: z.boolean().optional(),
  collectPortfolio: z.boolean().optional(),
});
