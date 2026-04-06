import { z } from "zod";
import { commonSchemas } from "./index";

/**
 * PATCH /api/job-seeker/profile — self-update by job seeker.
 * Uses .passthrough() so Mongoose runValidators can handle model-specific rules.
 */
export const jobSeekerProfileUpdateSchema = z
  .object({
    summary: z.string().max(5000).trim().optional(),
    nationality: z.string().max(100).trim().optional(),
    currentLocation: z.string().max(200).trim().optional(),
    skills: z
      .array(z.string().max(100).trim())
      .max(50)
      .optional(),
    experience: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
    education: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    languages: z.array(z.record(z.string(), z.unknown())).max(15).optional(),
    coverLetter: z.string().max(10000).trim().optional(),
    cv: z.string().url().max(2048).optional(),
    avatar: z.string().url().max(2048).optional(),
    phone: z.string().max(20).trim().optional(),
    dateOfBirth: z.string().max(30).optional(),
    maritalStatusId: commonSchemas.objectId.optional(),
    genderId: commonSchemas.objectId.optional(),
    expectedSalary: z.number().min(0).optional(),
    salaryPeriodId: commonSchemas.objectId.optional(),
    careerLevelId: commonSchemas.objectId.optional(),
    functionalAreaId: commonSchemas.objectId.optional(),
    industryId: commonSchemas.objectId.optional(),
    jobTypeId: commonSchemas.objectId.optional(),
    jobShiftId: commonSchemas.objectId.optional(),
  })
  .passthrough(); // allow model fields not listed here

/** PATCH /api/job-seekers/settings */
export const jobSeekerSettingsSchema = z.object({
  settings: z.object({
    autoApply: z.boolean().optional(),
    autoApplyFilters: z
      .object({
        minScore: z.number().int().min(0).max(100).optional(),
        maxDistance: z.string().max(50).optional(),
        onlyVerifiedEmployers: z.boolean().optional(),
      })
      .optional(),
    instantBooking: z.boolean().optional(),
    showSalary: z.boolean().optional(),
    openToRelocation: z.boolean().optional(),
  }),
});

/** PATCH /api/job-seekers/[id] — admin update */
export const jobSeekerAdminUpdateSchema = z.object({
  nationality: z.string().max(100).trim().optional(),
  currentLocation: z.string().max(200).trim().optional(),
  summary: z.string().max(5000).trim().optional(),
  skills: z.array(z.string().max(100).trim()).max(50).optional(),
  experience: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
  education: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
  languages: z.array(z.record(z.string(), z.unknown())).max(15).optional(),
  name: z.string().min(1).max(100).trim().optional(),
  email: commonSchemas.email.optional(),
});
