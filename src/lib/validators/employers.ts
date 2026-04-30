import { z } from "zod";
import { commonSchemas } from "./index";

export const employerCreateSchema = z.object({
  companyName: z.string().min(2).max(100).trim(),
  companyEmail: commonSchemas.email,
  phone: commonSchemas.phone,
  designation: z.string().max(100).trim().optional(),
  registrationNo: z.string().max(50).trim().optional(),
  taxId: z.string().max(50).trim().optional(),
  address: z.string().max(500).trim().optional(),
  website: commonSchemas.url.optional().or(z.literal("")),
  industry: z.string().max(100).optional(),
  companySize: z.string().max(50).optional(),
});

export const employerUpdateSchema = z.object({
  companyName: z.string().min(2).max(100).trim().optional(),
  companyEmail: commonSchemas.email.optional().or(z.literal("")),
  phone: commonSchemas.phone.optional().or(z.literal("")),
  // Note: empty string is valid (field cleared by user)
  designation: z.string().max(100).trim().optional(),
  registrationNo: z.string().max(50).trim().optional(),
  taxId: z.string().max(50).trim().optional(),
  address: z.string().max(500).trim().optional(),
  country: z.string().max(10).trim().optional(),
  website: commonSchemas.url.optional().or(z.literal("")),
  industry: z.string().max(100).optional(),
  companySize: z.string().max(50).optional(),
  workflowMode: z.enum(["auto", "manual"]).optional(),
  // Profile fields
  description: z.string().max(2000).trim().optional(),
  foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  socialLinks: z.object({
    linkedin: commonSchemas.url.optional().or(z.literal("")),
    twitter: commonSchemas.url.optional().or(z.literal("")),
    facebook: commonSchemas.url.optional().or(z.literal("")),
    instagram: commonSchemas.url.optional().or(z.literal("")),
  }).optional(),
  // Hiring preferences
  hiringPreferences: z.object({
    defaultVisibility: z.enum(["public", "private"]).optional(),
    preferredLocations: z.array(z.string().max(100).trim()).max(20).optional(),
    workType: z.enum(["remote", "onsite", "hybrid", "flexible"]).optional(),
  }).optional(),
  // Notification preferences
  notificationPrefs: z.object({
    emailNewApplicant: z.boolean().optional(),
    emailInterviewScheduled: z.boolean().optional(),
    emailOfferResponse: z.boolean().optional(),
    emailWeeklyDigest: z.boolean().optional(),
    inAppAll: z.boolean().optional(),
  }).optional(),
});

export const employerRegisterSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: commonSchemas.email,
  password: z.string().min(8).max(128),
  companyName: z.string().min(2).max(100).trim(),
  companyEmail: commonSchemas.email.optional(),
  phone: commonSchemas.phone,
  designation: z.string().max(100).trim().optional(),
  industry: z.string().max(100).optional(),
  companySize: z.string().max(50).optional(),
  locale: z.enum(["en", "ar"]).default("en"),
});

/** For admin creating employer user accounts */
export const employerAdminCreateSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: commonSchemas.email,
  password: z.string().min(8).max(128),
  companyName: z.string().max(100).trim().optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  phone: commonSchemas.phone.optional(),
});

/** For admin updating employer user accounts */
export const employerAdminUpdateSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  email: commonSchemas.email.optional(),
  companyName: z.string().max(100).trim().optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  phone: commonSchemas.phone.optional(),
  isActive: z.boolean().optional(),
});

/** Communication template creation */
export const commTemplateCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  type: z.enum(["rejection", "invite", "followup", "offer"]),
  subject: z.string().min(1).max(200).trim(),
  body: z.string().min(1).max(5000).trim(),
  isDefault: z.boolean().optional().default(false),
});

/** Communication template update */
export const commTemplateUpdateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  type: z.enum(["rejection", "invite", "followup", "offer"]).optional(),
  subject: z.string().min(1).max(200).trim().optional(),
  body: z.string().min(1).max(5000).trim().optional(),
  isDefault: z.boolean().optional(),
});
