import { z } from "zod";
import { commonSchemas } from "./index";
import { isLinkedInProfileUrl } from "@/lib/security/linkedin-url";

/**
 * PATCH /api/job-seeker/profile — self-update by job seeker.
 * Explicit allowlist of user-editable fields. System/sensitive fields
 * (agentId, isOnboarded, applicationMode, premiumLinkTag, cv.rawText,
 * profileCompleteness/boost, suggestedSkills, encrypted PII, documents, status)
 * are intentionally excluded and may only be set via server-side paths.
 */
export const jobSeekerProfileUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    fullName: z.string().min(1).max(200).trim().optional(),
    headline: z.string().max(200).trim().optional(),
    summary: z.string().max(5000).trim().optional(),
    nationality: z.string().max(100).trim().optional(),
    currentLocation: z.string().max(200).trim().optional(),
    profileVisibility: z.enum(["visible", "hidden"]).optional(),
    sectionVisibility: z.record(z.string(), z.boolean()).optional(),
    skills: z
      .array(z.string().max(100).trim())
      .max(50)
      .optional(),
    experience: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
    education: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
    languages: z.array(z.record(z.string(), z.unknown())).max(15).optional(),
    certifications: z.array(z.string().max(200).trim()).max(50).optional(),
    projects: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
    socialLinks: z
      .array(
        z
          .object({
            label: z.string().max(50).trim(),
            url: z.string().url().max(2048),
          })
          .refine(
            ({ label, url }) =>
              label.trim().toLowerCase() !== "linkedin" || isLinkedInProfileUrl(url),
            { message: "LinkedIn links must use https://www.linkedin.com/in/..." },
          ),
      )
      .max(20)
      .optional(),
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
    permanentAddress: z.string().max(500).trim().optional(),
    hometown: z.string().max(200).trim().optional(),
    pincode: z.string().max(20).trim().optional(),
    workPermitCountries: z.array(commonSchemas.objectId).max(5).optional(),
    maritalStatusId: commonSchemas.objectId.optional(),
    genderId: commonSchemas.objectId.optional(),
    expectedSalary: z.number().min(0).optional(),
    salaryPeriodId: commonSchemas.objectId.optional(),
    careerLevelId: commonSchemas.objectId.optional(),
    functionalAreaId: commonSchemas.objectId.optional(),
    industryId: commonSchemas.objectId.optional(),
    jobTypeId: commonSchemas.objectId.optional(),
    jobShiftId: commonSchemas.objectId.optional(),
  }); // unknown keys are stripped (no .passthrough) to block mass assignment

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
    timezone: z.string().max(50).optional(),
    timeBuffer: z.number().int().min(0).max(120).optional(),
    weeklyAvailability: z.array(z.string().max(10)).max(7).optional(),
    availableHours: z
      .array(
        z.object({
          day: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
          startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm"),
          endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm"),
        })
      )
      .max(7)
      .optional(),
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
