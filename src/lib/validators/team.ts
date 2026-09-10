import { z } from "zod";
import { commonSchemas } from "./index";
import { COMPANY_FUNCTIONS } from "@/models/CompanyUser";

/**
 * The employer's manual ticks on top of the roles they chose.
 *
 * Only the eleven grantable functions are accepted. The effective `permissions`
 * object is always recomputed server-side from roles plus these ticks, never
 * written straight from the request, so a caller cannot invent a flag or set
 * one the role system does not know about.
 */
const companyFunctionOverrides = z
  .record(z.enum(COMPANY_FUNCTIONS as readonly string[] as [string, ...string[]]), z.boolean())
  .optional();

export const teamInviteSchema = z.object({
  email: commonSchemas.email,
  companyRole: z.enum(["admin", "hiring_manager", "accounting", "finance_viewer", "viewer"]).optional(),
  companyRoles: z.array(z.enum(["admin", "hiring_manager", "accounting", "finance_viewer", "viewer"])).min(1).max(5).optional(),
  jobAccess: z.array(commonSchemas.objectId).max(50).optional(),
  permissionOverrides: companyFunctionOverrides,
}).refine((data) => data.companyRole || (data.companyRoles && data.companyRoles.length > 0), {
  message: "Either companyRole or companyRoles must be provided",
});

export const teamUpdateSchema = z.object({
  companyRole: z.enum(["admin", "hiring_manager", "accounting", "finance_viewer", "viewer"]).optional(),
  companyRoles: z.array(z.enum(["admin", "hiring_manager", "accounting", "finance_viewer", "viewer"])).min(1).max(5).optional(),
  jobAccess: z.array(commonSchemas.objectId).max(50).optional(),
  permissionOverrides: companyFunctionOverrides,
});

export const teamAcceptSchema = z.object({
  token: z.string().min(1).max(256),
});

export const domainVerifyRequestSchema = z.object({
  domain: z.string().min(3).max(255).trim(),
});

export const domainVerifyConfirmSchema = z.object({
  token: z.string().min(1).max(256),
});
