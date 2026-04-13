import { z } from "zod";
import { commonSchemas } from "./index";

/** Contact form submission (public, no auth) */
export const contactSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: commonSchemas.email,
  phone: z.string().max(20).trim().optional().or(z.literal("")),
  subject: z.string().max(200).trim().optional().or(z.literal("")),
  message: z.string().min(1).max(5000).trim(),
  captchaToken: z.string().max(2000).optional(),
});

/** Employer workflow pipeline stages & settings */
export const workflowUpdateSchema = z.object({
  stages: z
    .array(
      z.object({
        id: z.string().max(50),
        label: z.string().max(100),
        enabled: z.boolean(),
        autoProgress: z.boolean(),
        order: z.number().int().min(0),
      })
    )
    .max(20)
    .optional(),
  settings: z
    .object({
      aiAutoScreen: z.boolean().optional(),
      notifyOnStageChange: z.boolean().optional(),
      autoRejectBelow: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
});

/** Employer matching weights (must total 100) */
export const matchingWeightsSchema = z.object({
  weights: z.record(z.string(), z.number().min(0).max(100)),
});

/** Training item CRUD */
export const trainingCreateSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  provider: z.string().max(200).trim().optional().or(z.literal("")),
  url: z.string().url().max(500).optional().or(z.literal("")),
  targetRole: z.string().max(200).trim().optional().or(z.literal("")),
  status: z
    .enum(["not_started", "in_progress", "completed"])
    .default("not_started"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional().or(z.literal("")),
  notes: z.string().max(2000).trim().optional().or(z.literal("")),
});

export const trainingUpdateSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
  notes: z.string().max(2000).trim().optional(),
});

/** Notification mark-as-read */
export const notificationUpdateSchema = z.object({
  ids: z.array(commonSchemas.objectId).min(1).max(100).optional(),
  markAllRead: z.boolean().optional(),
});

/** Password change */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

/** PATCH /api/users/locale */
export const localeSchema = z.object({
  locale: z.enum(["en", "ar"]),
});

/** POST /api/ai/chat-history */
export const chatHistoryCreateSchema = z.object({
  threadId: commonSchemas.objectId.optional(),
  context: z.string().min(1).max(100),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(10000),
      })
    )
    .min(1)
    .max(100),
  title: z.string().max(200).trim().optional(),
});
