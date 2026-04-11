import { z } from "zod";
import { commonSchemas } from "./index";

const locationSchema = z.object({
  country: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  isRemote: z.boolean().default(false),
});

const salarySchema = z
  .object({
    min: z.number().min(0),
    max: z.number().min(0),
    currency: z.string().length(3).default("USD"),
    isNegotiable: z.boolean().default(false),
    period: z.enum(["monthly", "yearly", "lpa"]).default("monthly"),
  })
  .refine((s) => s.max >= s.min, { message: "max salary must be >= min" });

const requirementsSchema = z.object({
  skills: z.array(z.string().max(100)).max(50).optional(),
  experienceMin: z.number().int().min(0).max(50).optional(),
  experienceMax: z.number().int().min(0).max(50).optional(),
});

export const jobCreateSchema = z.object({
  title: z.string().min(5).max(200).trim(),
  description: z.string().min(20).max(5000).trim(),
  category: z.string().max(100).optional(),
  location: locationSchema.optional(),
  requirements: requirementsSchema.optional(),
  salary: salarySchema.optional(),
  expiresAt: z.string().datetime().optional(),
  applicationMode: z.enum(["auto", "manual"]).optional(),
  employerId: commonSchemas.objectId.optional(),
  agentId: commonSchemas.objectId.optional(),
  vacancies: z.number().int().min(1).max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  visibility: z.enum(["public", "private", "invite_only"]).optional(),
  status: z.enum(["draft", "active"]).optional(),
});

export const jobUpdateSchema = z.object({
  title: z.string().min(5).max(200).trim().optional(),
  description: z.string().min(20).max(5000).trim().optional(),
  category: z.string().max(100).optional(),
  location: locationSchema.optional(),
  status: z.enum(["draft", "active", "closed", "expired"]).optional(),
  requirements: requirementsSchema.optional(),
  salary: salarySchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  applicationMode: z.enum(["auto", "manual"]).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  vacancies: z.number().int().min(1).max(100).optional(),
  visibility: z.enum(["public", "private", "invite_only"]).optional(),
});
