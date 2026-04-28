import { z } from "zod";
import { commonSchemas } from "./index";

const screeningQuestionSchema = z.object({
  id: z.string().min(1).max(50),
  label: z.string().min(1).max(500),
  type: z.enum(["text", "textarea", "select", "checkbox", "radio", "number", "date"]),
  required: z.boolean().default(false),
  options: z.array(z.string().max(200)).max(20).optional(),
  placeholder: z.string().max(200).optional(),
  order: z.number().int().min(0).default(0),
}).refine(
  (q) => {
    if (["select", "radio"].includes(q.type)) {
      return q.options && q.options.length > 0;
    }
    return true;
  },
  { message: "select/radio questions must have at least 1 option" }
);

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

const requirementsSchema = z
  .object({
    skills: z.array(z.string().max(100)).max(50).optional(),
    preferredSkills: z.array(z.string().max(100)).max(30).optional(),
    experienceMin: z.number().int().min(0).max(50).optional(),
    experienceMax: z.number().int().min(0).max(50).optional(),
    education: z.string().max(200).optional(),
    languages: z.array(z.string().max(100)).max(20).optional(),
    nationality: z.array(z.string().max(100)).max(50).optional(),
  })
  .refine(
    (r) =>
      r.experienceMin === undefined ||
      r.experienceMax === undefined ||
      r.experienceMax >= r.experienceMin,
    { message: "experienceMax must be >= experienceMin" }
  );

export const jobCreateSchema = z.object({
  title: z.string().min(5).max(200).trim(),
  description: z.string().min(20).max(5000).trim(),
  category: z.string().max(100).optional(),
  location: locationSchema.optional(),
  requirements: requirementsSchema.optional(),
  salary: salarySchema.optional(),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship", "freelance"]).optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
  duration: z.string().max(100).optional(),
  responsibilities: z.array(z.string().max(500)).max(20).optional(),
  qualifications: z.array(z.string().max(500)).max(20).optional(),
  benefits: z.array(z.string().max(500)).max(20).optional(),
  learningOutcomes: z.array(z.string().max(500)).max(20).optional(),
  expiresAt: z.string().datetime().optional(),
  applicationMode: z.enum(["auto", "manual"]).optional(),
  employerId: commonSchemas.objectId.optional(),
  agentId: commonSchemas.objectId.optional(),
  vacancies: z.number().int().min(1).max(100).optional(),
  maxApplicants: z.number().int().min(1).max(10000).optional(),
  showSalary: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  visibility: z.enum(["public", "private", "invite_only"]).optional(),
  status: z.enum(["draft", "active"]).optional(),
  screeningQuestions: z.array(screeningQuestionSchema).max(20).optional(),
});

export const jobUpdateSchema = z.object({
  title: z.string().min(5).max(200).trim().optional(),
  description: z.string().min(20).max(5000).trim().optional(),
  category: z.string().max(100).optional(),
  location: locationSchema.optional(),
  status: z.enum(["draft", "active", "paused", "closed", "expired"]).optional(),
  requirements: requirementsSchema.optional(),
  salary: salarySchema.optional(),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship", "freelance"]).optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
  duration: z.string().max(100).optional(),
  responsibilities: z.array(z.string().max(500)).max(20).optional(),
  qualifications: z.array(z.string().max(500)).max(20).optional(),
  benefits: z.array(z.string().max(500)).max(20).optional(),
  learningOutcomes: z.array(z.string().max(500)).max(20).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  applicationMode: z.enum(["auto", "manual"]).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  vacancies: z.number().int().min(1).max(100).optional(),
  maxApplicants: z.number().int().min(1).max(10000).optional(),
  showSalary: z.boolean().optional(),
  visibility: z.enum(["public", "private", "invite_only"]).optional(),
  screeningQuestions: z.array(screeningQuestionSchema).max(20).optional(),
});
