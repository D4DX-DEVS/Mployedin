import { z } from "zod";
import { WEBHOOK_EVENTS } from "@/models/Webhook";

export const webhookCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  url: z.string().url().max(2048),
  secret: z.string().min(16).max(256).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS as unknown as [string, ...string[]])).min(1).max(10),
  headers: z.record(z.string().max(50), z.string().max(500)).optional(),
  isActive: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
});

export const webhookUpdateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  url: z.string().url().max(2048).optional(),
  secret: z.string().min(16).max(256).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS as unknown as [string, ...string[]])).min(1).max(10).optional(),
  headers: z.record(z.string().max(50), z.string().max(500)).optional(),
  isActive: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
});
