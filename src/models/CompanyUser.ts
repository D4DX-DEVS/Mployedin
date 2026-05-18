import mongoose, { Document, Schema } from "mongoose";

export type CompanyRole = "owner" | "admin" | "hiring_manager" | "accounting" | "finance_viewer" | "viewer";
export type CompanyUserStatus = "pending" | "active" | "deactivated";

export interface ICompanyUserPermissions {
  canCreateJobs: boolean;
  canManageTeam: boolean;
  canViewAnalytics: boolean;
  canExportData: boolean;
  canManageBilling: boolean;
  canViewReports: boolean;
  canApproveInvoices: boolean;
  canViewCommissions: boolean;
}

export interface ICompanyUser extends Document {
  _id: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  email: string;
  companyRole: CompanyRole;
  companyRoles: CompanyRole[];
  jobAccess: mongoose.Types.ObjectId[];
  permissions: ICompanyUserPermissions;
  invitedBy: mongoose.Types.ObjectId;
  inviteToken?: string;
  inviteExpiresAt?: Date;
  invitedAt: Date;
  acceptedAt?: Date;
  status: CompanyUserStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_PERMISSIONS: Record<CompanyRole, ICompanyUserPermissions> = {
  owner: { canCreateJobs: true, canManageTeam: true, canViewAnalytics: true, canExportData: true, canManageBilling: true, canViewReports: true, canApproveInvoices: true, canViewCommissions: true },
  admin: { canCreateJobs: true, canManageTeam: true, canViewAnalytics: true, canExportData: true, canManageBilling: true, canViewReports: true, canApproveInvoices: true, canViewCommissions: true },
  hiring_manager: { canCreateJobs: true, canManageTeam: false, canViewAnalytics: false, canExportData: false, canManageBilling: false, canViewReports: false, canApproveInvoices: false, canViewCommissions: false },
  accounting: { canCreateJobs: false, canManageTeam: false, canViewAnalytics: true, canExportData: true, canManageBilling: true, canViewReports: true, canApproveInvoices: true, canViewCommissions: true },
  finance_viewer: { canCreateJobs: false, canManageTeam: false, canViewAnalytics: true, canExportData: false, canManageBilling: false, canViewReports: true, canApproveInvoices: false, canViewCommissions: true },
  viewer: { canCreateJobs: false, canManageTeam: false, canViewAnalytics: false, canExportData: false, canManageBilling: false, canViewReports: false, canApproveInvoices: false, canViewCommissions: false },
};

export function getDefaultPermissions(role: CompanyRole): ICompanyUserPermissions {
  return { ...DEFAULT_PERMISSIONS[role] };
}

/** Merge permissions from multiple roles (union — any true wins) */
export function getMergedPermissions(roles: CompanyRole[]): ICompanyUserPermissions {
  const merged: ICompanyUserPermissions = {
    canCreateJobs: false, canManageTeam: false, canViewAnalytics: false,
    canExportData: false, canManageBilling: false, canViewReports: false,
    canApproveInvoices: false, canViewCommissions: false,
  };
  for (const role of roles) {
    const perms = DEFAULT_PERMISSIONS[role];
    if (!perms) continue;
    for (const key of Object.keys(merged) as (keyof ICompanyUserPermissions)[]) {
      if (perms[key]) merged[key] = true;
    }
  }
  return merged;
}

/** Role priority for determining primary role (highest privilege first) */
const ROLE_PRIORITY: CompanyRole[] = ["owner", "admin", "hiring_manager", "accounting", "finance_viewer", "viewer"];

/** Get the highest-privilege role from an array of roles */
export function getPrimaryRole(roles: CompanyRole[]): CompanyRole {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return roles[0] ?? "viewer";
}

const CompanyUserSchema = new Schema<ICompanyUser>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    email: { type: String, required: true, lowercase: true, trim: true },
    companyRole: {
      type: String,
      enum: ["owner", "admin", "hiring_manager", "accounting", "finance_viewer", "viewer"],
      required: true,
    },
    companyRoles: {
      type: [{ type: String, enum: ["owner", "admin", "hiring_manager", "accounting", "finance_viewer", "viewer"] }],
      default: [],
    },
    jobAccess: [{ type: Schema.Types.ObjectId, ref: "Job" }],
    permissions: {
      canCreateJobs: { type: Boolean, default: true },
      canManageTeam: { type: Boolean, default: false },
      canViewAnalytics: { type: Boolean, default: false },
      canExportData: { type: Boolean, default: false },
      canManageBilling: { type: Boolean, default: false },
      canViewReports: { type: Boolean, default: false },
      canApproveInvoices: { type: Boolean, default: false },
      canViewCommissions: { type: Boolean, default: false },
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    inviteToken: { type: String, select: false },
    inviteExpiresAt: Date,
    invitedAt: { type: Date, default: Date.now },
    acceptedAt: Date,
    status: {
      type: String,
      enum: ["pending", "active", "deactivated"],
      default: "pending",
    },
  },
  { timestamps: true }
);

CompanyUserSchema.index({ companyId: 1, userId: 1 }, { unique: true, sparse: true });
CompanyUserSchema.index({ companyId: 1, email: 1 }, { unique: true });
CompanyUserSchema.index({ companyId: 1, status: 1 });
CompanyUserSchema.index({ inviteToken: 1 }, { sparse: true });
CompanyUserSchema.index({ userId: 1 });

export const CompanyUser =
  mongoose.models.CompanyUser ||
  mongoose.model<ICompanyUser>("CompanyUser", CompanyUserSchema);
export default CompanyUser;
