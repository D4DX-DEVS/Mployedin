import { z } from "zod";
import { commonSchemas } from "./index";

export const jobCreateSchema = z.object({
  title: z.string().min(5).max(200).trim(),
  description: z.string().min(20).max(5000).trim(),
  category: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  requirements: z
    .object({
      skills: z.array(z.string().max(100)).max(50).optional(),
      experienceMin: z.number().int().min(0).max(50).optional(),
      experienceMax: z.number().int().min(0).max(50).optional(),
    })
    .optional(),
  salary: z
    .object({
      min: z.number().min(0),
      max: z.number().min(0),
      currency: z.string().length(3).default("USD"),
    })
    .refine((s) => s.max >= s.min, { message: "max salary must be >= min" })
    .optional(),
  expiresAt: z.string().datetime().optional(),
  applicationMode: z.enum(["auto", "manual"]).optional(),
  employerId: commonSchemas.objectId.optional(),
});

export const jobUpdateSchema = z.object({
  title: z.string().min(5).max(200).trim().optional(),
  description: z.string().min(20).max(5000).trim().optional(),
  category: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  status: z.enum(["draft", "active", "closed", "paused"]).optional(),
  requirements: z
    .object({
      skills: z.array(z.string().max(100)).max(50).optional(),
      experienceMin: z.number().int().min(0).max(50).optional(),
      experienceMax: z.number().int().min(0).max(50).optional(),
    })
    .optional(),
  salary: z
    .object({
      min: z.number().min(0),
      max: z.number().min(0),
      currency: z.string().length(3).default("USD"),
    })
    .refine((s) => s.max >= s.min, { message: "max salary must be >= min" })
    .optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  applicationMode: z.enum(["auto", "manual"]).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  vacancies: z.number().int().min(1).max(100).optional(),
});
