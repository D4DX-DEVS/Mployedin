import mongoose, { Document, Schema } from "mongoose";

export type CompanyRole = "owner" | "admin" | "hiring_manager" | "viewer";
export type CompanyUserStatus = "pending" | "active" | "deactivated";

export interface ICompanyUserPermissions {
  canCreateJobs: boolean;
  canManageTeam: boolean;
  canViewAnalytics: boolean;
  canExportData: boolean;
}

export interface ICompanyUser extends Document {
  _id: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  email: string;
  companyRole: CompanyRole;
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
  owner: { canCreateJobs: true, canManageTeam: true, canViewAnalytics: true, canExportData: true },
  admin: { canCreateJobs: true, canManageTeam: true, canViewAnalytics: true, canExportData: true },
  hiring_manager: { canCreateJobs: true, canManageTeam: false, canViewAnalytics: false, canExportData: false },
  viewer: { canCreateJobs: false, canManageTeam: false, canViewAnalytics: false, canExportData: false },
};

export function getDefaultPermissions(role: CompanyRole): ICompanyUserPermissions {
  return { ...DEFAULT_PERMISSIONS[role] };
}

const CompanyUserSchema = new Schema<ICompanyUser>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    email: { type: String, required: true, lowercase: true, trim: true },
    companyRole: {
      type: String,
      enum: ["owner", "admin", "hiring_manager", "viewer"],
      required: true,
    },
    jobAccess: [{ type: Schema.Types.ObjectId, ref: "Job" }],
    permissions: {
      canCreateJobs: { type: Boolean, default: true },
      canManageTeam: { type: Boolean, default: false },
      canViewAnalytics: { type: Boolean, default: false },
      canExportData: { type: Boolean, default: false },
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
