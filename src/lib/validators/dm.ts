import { z } from "zod";
import { commonSchemas } from "./index";

/** POST /api/dm — start conversation */
export const dmStartConversationSchema = z.object({
  recipientId: commonSchemas.objectId,
});

/** POST /api/dm/[conversationId]/messages */
export const dmSendMessageSchema = z.object({
  content: z.string().min(1).max(2000).trim(),
});

/** PATCH /api/dm/[conversationId]/manage */
export const dmManageConversationSchema = z.object({
  action: z.enum(["clear"]),
});

/** POST /api/dm/customer-care */
export const customerCareTicketSchema = z.object({
  message: z.string().min(1).max(2000).trim(),
  category: z
    .enum(["account", "job_search", "technical", "billing", "other"])
    .default("other"),
});

/** PATCH /api/dm/customer-care/[conversationId]/manage */
export const customerCareManageSchema = z.object({
  status: z
    .enum(["open", "assigned", "resolved", "closed"])
    .optional(),
  assignedTo: commonSchemas.objectId.optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});
