import { z } from "zod";
import { commonSchemas } from "./index";

const VALID_ROLES = ["admin", "super_agent", "agent", "employer", "job_seeker"] as const;
const PERMISSION_MODES = ["default", "custom"] as const;
const BULK_ACTIONS = ["setRole", "activate", "deactivate", "delete"] as const;

/** POST /api/admin/users */
export const adminUserCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: commonSchemas.email,
  password: z.string().min(8).max(128),
  role: z.enum(VALID_ROLES),
  locale: z.enum(["en", "ar"]).optional(),
  permissionMode: z.enum(PERMISSION_MODES).optional(),
  customPermissions: z.record(z.string(), z.unknown()).optional(),
  superAgentId: commonSchemas.objectId.optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  overrideRate: z.number().min(0).max(100).optional(),
  assignedCityIds: z.array(commonSchemas.objectId).max(200).optional(),
  assignedStateIds: z.array(commonSchemas.objectId).max(200).optional(),
  agentIds: z.array(commonSchemas.objectId).max(200).optional(),
});

/** PATCH /api/admin/users (single) */
export const adminUserUpdateSchema = z.object({
  userId: commonSchemas.objectId,
  role: z.enum(VALID_ROLES).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).max(100).trim().optional(),
  email: commonSchemas.email.optional(),
  permissionMode: z.enum(PERMISSION_MODES).optional(),
  customPermissions: z.record(z.string(), z.unknown()).optional(),
});

/** PATCH /api/admin/users (bulk) */
export const adminUserBulkSchema = z.object({
  ids: z.array(commonSchemas.objectId).min(1).max(200),
  action: z.enum(BULK_ACTIONS),
  role: z.enum(VALID_ROLES).optional(),
});

/** POST /api/admin/super-agents */
export const superAgentCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: commonSchemas.email,
  password: z.string().min(8).max(128),
  overrideCommissionRate: z.number().min(0).max(100).optional(),
  assignedCityIds: z.array(commonSchemas.objectId).max(200).optional(),
  assignedStateIds: z.array(commonSchemas.objectId).max(200).optional(),
  agentIds: z.array(commonSchemas.objectId).max(200).optional(),
});

/** PATCH /api/admin/super-agents */
export const superAgentUpdateSchema = z.object({
  userId: commonSchemas.objectId,
  name: z.string().min(1).max(100).trim().optional(),
  email: commonSchemas.email.optional(),
  isActive: z.boolean().optional(),
  overrideCommissionRate: z.number().min(0).max(100).optional(),
  assignedCityIds: z.array(commonSchemas.objectId).max(200).optional(),
  assignedStateIds: z.array(commonSchemas.objectId).max(200).optional(),
  agentIds: z.array(commonSchemas.objectId).max(200).optional(),
});

/** POST /api/admin/agents */
export const agentCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: commonSchemas.email,
  password: z.string().min(8).max(128),
  superAgentId: commonSchemas.objectId.optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  assignedCityIds: z.array(commonSchemas.objectId).max(200).optional(),
  assignedStateIds: z.array(commonSchemas.objectId).max(200).optional(),
});

/** PATCH /api/admin/agents */
export const agentUpdateSchema = z.object({
  userId: commonSchemas.objectId,
  name: z.string().min(1).max(100).trim().optional(),
  email: commonSchemas.email.optional(),
  isActive: z.boolean().optional(),
  superAgentId: commonSchemas.objectId.optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  assignedCityIds: z.array(commonSchemas.objectId).max(200).optional(),
  assignedStateIds: z.array(commonSchemas.objectId).max(200).optional(),
});

/** POST /api/admin/impersonate */
export const impersonateSchema = z
  .object({
    userId: commonSchemas.objectId.optional(),
    exit: z.literal(true).optional(),
  })
  .refine((d) => d.userId || d.exit, {
    message: "Either userId or exit: true is required",
  });

/** POST /api/admin/communications */
export const communicationSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  message: z.string().min(1).max(5000).trim(),
  targetRole: z.enum(VALID_ROLES).optional(),
  targetAll: z.boolean().optional(),
  channel: z.enum(["in_app", "email", "whatsapp"]).default("in_app"),
});

/** PATCH /api/admin/users — handles both single and bulk */
export const adminUserPatchSchema = z.union([
  adminUserBulkSchema,
  adminUserUpdateSchema,
]);

/** DELETE /api/admin/users */
export const adminUserDeleteSchema = z.object({
  userId: commonSchemas.objectId,
  permanent: z.boolean().optional(),
});
