import { z } from "zod";
import { commonSchemas } from "./index";

export const teamInviteSchema = z.object({
  email: commonSchemas.email,
  companyRole: z.enum(["admin", "hiring_manager", "accounting", "finance_viewer", "viewer"]).optional(),
  companyRoles: z.array(z.enum(["admin", "hiring_manager", "accounting", "finance_viewer", "viewer"])).min(1).max(5).optional(),
  jobAccess: z.array(commonSchemas.objectId).max(50).optional(),
  permissions: z
    .object({
      canCreateJobs: z.boolean().optional(),
      canManageTeam: z.boolean().optional(),
      canViewAnalytics: z.boolean().optional(),
      canExportData: z.boolean().optional(),
      canManageBilling: z.boolean().optional(),
      canViewReports: z.boolean().optional(),
      canApproveInvoices: z.boolean().optional(),
      canViewCommissions: z.boolean().optional(),
    })
    .optional(),
}).refine((data) => data.companyRole || (data.companyRoles && data.companyRoles.length > 0), {
  message: "Either companyRole or companyRoles must be provided",
});

export const teamUpdateSchema = z.object({
  companyRole: z.enum(["admin", "hiring_manager", "accounting", "finance_viewer", "viewer"]).optional(),
  jobAccess: z.array(commonSchemas.objectId).max(50).optional(),
  permissions: z
    .object({
      canCreateJobs: z.boolean().optional(),
      canManageTeam: z.boolean().optional(),
      canViewAnalytics: z.boolean().optional(),
      canExportData: z.boolean().optional(),
      canManageBilling: z.boolean().optional(),
      canViewReports: z.boolean().optional(),
      canApproveInvoices: z.boolean().optional(),
      canViewCommissions: z.boolean().optional(),
    })
    .optional(),
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
