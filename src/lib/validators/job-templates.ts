import { z } from "zod";
import { commonSchemas } from "./index";

export const jobTemplateCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  title: z.string().max(200).trim().optional(),
  description: z.string().max(5000).trim().optional(),
  category: z.string().max(100).optional(),
  requirements: z
    .object({
      skills: z.array(z.string().max(100)).max(50).optional(),
      experienceMin: z.number().int().min(0).max(50).optional(),
      experienceMax: z.number().int().min(0).max(50).optional(),
      education: z.string().optional(),
      languages: z.array(z.string().max(100)).optional(),
    })
    .optional(),
  salary: z
    .object({
      min: z.number().min(0).optional(),
      max: z.number().min(0).optional(),
      currency: z.string().length(3).optional(),
      isNegotiable: z.boolean().optional(),
    })
    .optional(),
  location: z
    .object({
      country: z.string().optional(),
      city: z.string().optional(),
      isRemote: z.boolean().optional(),
    })
    .optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  vacancies: z.number().int().min(1).max(100).optional(),
  applicationMode: z.enum(["auto", "manual"]).optional(),
});

export const jobTemplateUpdateSchema = jobTemplateCreateSchema;
