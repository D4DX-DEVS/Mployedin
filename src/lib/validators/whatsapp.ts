import { z } from "zod";
import { BROADCAST_ROLES } from "@/lib/communications/broadcastAudience";

/** Meta template names: lowercase letters, digits, underscores. */
export const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;
/** Meta language codes we send: "en", "ar", "en_US", … */
export const templateLanguageSchema = z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/);
/** Body parameter values (tokens allowed; sanitised at send time). */
export const templateParamSchema = z.string().max(1024);

const automationSettingSchema = z.object({
  enabled: z.boolean().optional(),
  templateName: z.string().regex(TEMPLATE_NAME_RE).optional(),
  params: z.array(templateParamSchema).max(10).optional(),
});

/** PATCH /api/admin/whatsapp/config — explicit keys, not z.record (Zod 4 demands every enum key). */
export const whatsAppConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  dailyCapPerUser: z.number().int().min(1).max(20).optional(),
  automations: z
    .object({
      applicationReceived: automationSettingSchema.optional(),
      applicationStatus: automationSettingSchema.optional(),
      interviewInvite: automationSettingSchema.optional(),
      interviewScheduled: automationSettingSchema.optional(),
      interviewReminder: automationSettingSchema.optional(),
      offerUpdate: automationSettingSchema.optional(),
      commissionPaid: automationSettingSchema.optional(),
    })
    .optional(),
});

/** POST /api/admin/whatsapp/test */
export const whatsAppTestSendSchema = z.object({
  to: z.string().min(6).max(24),
  templateName: z.string().regex(TEMPLATE_NAME_RE).default("hello_world"),
  language: templateLanguageSchema.default("en_US"),
  params: z.array(templateParamSchema).max(10).default([]),
});

/** The WhatsApp leg of a broadcast (POST /api/admin/communications) and of a schedule. */
export const broadcastWhatsAppSchema = z.object({
  templateName: z.string().regex(TEMPLATE_NAME_RE),
  language: templateLanguageSchema,
  params: z.array(templateParamSchema).max(10).default([]),
});

const audienceSchema = z.object({
  targetAll: z.boolean().default(false),
  targetRoles: z.array(z.enum(BROADCAST_ROLES)).max(10).default([]),
});

/** 5-field cron. Frequency floor (once per hour) is enforced in schedule.ts. */
const cronSchema = z.string().trim().min(9).max(64);

/** POST /api/admin/whatsapp/schedules */
export const whatsAppScheduleCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    kind: z.enum(["once", "recurring"]),
    runAt: z.string().datetime({ offset: true }).optional(),
    cron: cronSchema.optional(),
    timezone: z.string().min(1).max(64).default("Asia/Dubai"),
    template: broadcastWhatsAppSchema,
    audience: audienceSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "once" && !v.runAt) ctx.addIssue({ code: "custom", path: ["runAt"], message: "A one-time schedule needs a run time" });
    if (v.kind === "recurring" && !v.cron) ctx.addIssue({ code: "custom", path: ["cron"], message: "A recurring schedule needs a cron expression" });
  });

/** PATCH /api/admin/whatsapp/schedules/[id] — partial */
export const whatsAppScheduleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  kind: z.enum(["once", "recurring"]).optional(),
  runAt: z.string().datetime({ offset: true }).optional(),
  cron: cronSchema.optional(),
  timezone: z.string().min(1).max(64).optional(),
  template: broadcastWhatsAppSchema.optional(),
  audience: audienceSchema.optional(),
});
