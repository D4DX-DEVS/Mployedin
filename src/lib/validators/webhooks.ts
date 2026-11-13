import { z } from "zod";
import { WEBHOOK_EVENTS } from "@/models/Webhook";

// Reject bare hosts like "example" or "localhost" — they can never resolve
// publicly, so a saved hook would only ever produce failed deliveries.
const webhookUrl = z
  .string()
  .url()
  .max(2048)
  .refine((raw) => {
    try {
      return new URL(raw).hostname.includes(".");
    } catch {
      return false;
    }
  }, "URL must use a fully-qualified public host (e.g. https://api.example.com/hooks)");

export const webhookCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  url: webhookUrl,
  secret: z.string().min(16).max(256).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS as unknown as [string, ...string[]])).min(1).max(10),
  headers: z.record(z.string().max(50), z.string().max(500)).optional(),
  isActive: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
});

/**
 * What an employer may send when creating their own webhook through
 * /api/developer. Same field rules as the admin form, minus `secret` and
 * `isActive`: the route always generates the secret and creates the hook
 * active, so those are dropped rather than trusted from the request.
 */
export const employerWebhookCreateSchema = webhookCreateSchema.pick({
  name: true,
  url: true,
  events: true,
  headers: true,
  retryCount: true,
});

export const webhookUpdateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  url: webhookUrl.optional(),
  secret: z.string().min(16).max(256).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS as unknown as [string, ...string[]])).min(1).max(10).optional(),
  headers: z.record(z.string().max(50), z.string().max(500)).optional(),
  isActive: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
});
