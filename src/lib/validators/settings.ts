import { z } from "zod";
import { commonSchemas } from "./index";

/** PATCH /api/agent/settings & /api/super-agent/settings */
export const agentSettingsUpdateSchema = z.object({
  country: z.string().max(5).trim().optional(),
  currencyCode: z.string().max(5).trim().optional(),
});

/** PATCH /api/super-agent/profile */
export const superAgentProfileUpdateSchema = z.object({
  overrideRate: z.number().min(0).max(100).optional(),
});

/** PATCH /api/user/notification-preferences */
export const notificationPreferencesUpdateSchema = z.object({
  emailFrequency: z.enum(["instant", "daily", "weekly", "none"]).optional(),
  categories: z
    .record(
      z.string().max(50),
      z.object({
        enabled: z.boolean().optional(),
        channels: z
          .array(z.enum(["in_app", "email", "whatsapp"]))
          .max(5)
          .optional(),
      })
    )
    .optional(),
  unsubscribedAll: z.boolean().optional(),
  dailyDigestTime: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
});

/** POST /api/admin/settings — system settings */
export const systemSettingsUpdateSchema = z.object({
  platformName: z.string().max(100).trim().optional(),
  supportEmail: z.string().email().max(254).optional(),
  maintenanceMode: z.boolean().optional(),
  smtp: z
    .object({
      smtpEmail: z.string().email().max(254).optional(),
      smtpHost: z.string().max(200).optional(),
      smtpPort: z.number().int().min(1).max(65535).optional(),
      smtpSecure: z.boolean().optional(),
      smtpAppPassword: z.string().max(500).optional(),
    })
    .optional(),
});

/** PATCH /api/admin/notification-config */
export const notificationConfigUpdateSchema = z.object({
  cronJobs: z
    .record(
      z.string().max(50),
      z.object({ enabled: z.boolean() })
    )
    .optional(),
  globalDefaults: z
    .object({
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().max(500).optional(),
      defaultFrequency: z.enum(["instant", "daily", "weekly", "none"]).optional(),
      maxEmailsPerUserPerDay: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

/** POST /api/admin/notification-config/user-override */
export const notificationUserOverrideCreateSchema = z.object({
  userId: commonSchemas.objectId,
  action: z.enum(["force_unsubscribe", "force_instant", "pause_emails"]),
  reason: z.string().min(1).max(500).trim(),
});

/** DELETE /api/admin/notification-config/user-override */
export const notificationUserOverrideDeleteSchema = z.object({
  userId: commonSchemas.objectId,
});

/** POST /api/admin/test-email */
export const testEmailSchema = z.object({
  to: z.string().email().max(254),
});

/** POST /api/admin/settings/test-email */
export const smtpTestSchema = z.object({
  smtp: z.object({
    smtpEmail: z.string().email().max(254),
    smtpAppPassword: z.string().min(1).max(500),
    smtpHost: z.string().max(200).optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
  }),
});

/** PUT /api/employers/me/smtp */
export const employerSmtpConfigSchema = z.object({
  smtp: z.object({
    smtpEmail: z.string().email().max(254).optional(),
    smtpHost: z.string().max(200).optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpAppPassword: z.string().max(500).optional(),
  }),
});
