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
    preferredJobType: z.enum(["remote", "hybrid", "onsite", "any"]).optional(),
    preferredRoles: z.array(z.string().max(100).trim()).max(20).optional(),
    preferredCountries: z.array(z.string().max(100).trim()).max(20).optional(),
    preferredSalary: z.object({
      min: z.number().min(0),
      max: z.number().min(0),
      currency: z.string().max(5),
    }).optional(),
    availabilityStatus: z.enum(["immediately", "within_month", "within_3_months", "not_available"]).optional(),
    noticePeriod: z.number().int().min(0).max(365).optional(),
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
    // A — Auto Apply
    autoApply: z.boolean().optional(),
    autoApplyFilters: z
      .object({
        minScore: z.number().int().min(0).max(100).optional(),
        maxDistance: z.string().max(50).optional(),
        onlyVerifiedEmployers: z.boolean().optional(),
      })
      .optional(),
    applySpeed: z.enum(["safe", "balanced", "aggressive"]).optional(),
    preferredJobTypes: z.array(z.string().max(50)).max(10).optional(),
    preferredLocations: z.array(z.string().max(100)).max(10).optional(),
    salaryMin: z.number().min(0).optional(),
    salaryMax: z.number().min(0).optional(),
    salaryCurrency: z.string().max(5).optional(),
    // B — Interview
    instantBooking: z.boolean().optional(),
    calendarConnected: z.boolean().optional(),
    timeBuffer: z.number().int().min(0).max(120).optional(),
    weeklyAvailability: z.array(z.string().max(10)).max(7).optional(),
    // C — Profile
    showSalary: z.boolean().optional(),
    openToRelocation: z.boolean().optional(),
    // D — Resume & AI
    defaultResumeId: z.string().max(200).optional(),
    autoGenerateCoverLetter: z.boolean().optional(),
    coverLetterTone: z.enum(["professional", "friendly", "bold"]).optional(),
    autoAnswerScreening: z.boolean().optional(),
    // E — Notifications
    notifications: z
      .object({
        jobMatchAlerts: z.boolean().optional(),
        applicationSubmitted: z.boolean().optional(),
        interviewNotifications: z.boolean().optional(),
      })
      .optional(),
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
