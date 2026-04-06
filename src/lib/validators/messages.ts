import { z } from "zod";
import { commonSchemas } from "./index";

export const messageCreateSchema = z.object({
  channel: z.string().max(100).default("general"),
  content: z.string().min(1).max(2000).trim(),
  senderName: z.string().max(100).optional(),
  recipientId: commonSchemas.objectId.optional(),
  jobId: commonSchemas.objectId.optional(),
  threadId: commonSchemas.objectId.optional(),
  attachments: z
    .array(
      z.object({
        url: z.string().url().max(2048),
        name: z.string().max(255),
        type: z.string().max(100),
      })
    )
    .max(5)
    .optional(),
});

export const messageUpdateSchema = z.object({
  isRead: z.boolean().optional(),
});
