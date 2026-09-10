import mongoose, { Document, Schema } from "mongoose";

// The roles, flags and permission maths live in a Mongoose-free module so
// client components can import them without dragging the driver into the
// browser bundle. Re-exported here so every existing server import still works.
export * from "@/lib/permissions/companyRoles";
import type {
  CompanyRole,
  CompanyUserStatus,
  ICompanyUserPermissions,
  PermissionFlag,
} from "@/lib/permissions/companyRoles";
import { getDefaultPermissions } from "@/lib/permissions/companyRoles";

export interface ICompanyUser extends Document {
  _id: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  email: string;
  companyRole: CompanyRole;
  companyRoles: CompanyRole[];
  jobAccess: mongoose.Types.ObjectId[];
  permissions: ICompanyUserPermissions;
  permissionOverrides?: Partial<Record<PermissionFlag, boolean>>;
  invitedBy: mongoose.Types.ObjectId;
  inviteToken?: string;
  inviteExpiresAt?: Date;
  invitedAt: Date;
  acceptedAt?: Date;
  status: CompanyUserStatus;
  createdAt: Date;
  updatedAt: Date;
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
      canReviewApplicants: { type: Boolean, default: false },
      canScheduleInterviews: { type: Boolean, default: false },
      canSendOffers: { type: Boolean, default: false },
      canOnboardPlacements: { type: Boolean, default: false },
      canRunScreening: { type: Boolean, default: false },
      canManageTalentPools: { type: Boolean, default: false },
      canManageCompanySettings: { type: Boolean, default: false },
    },
    permissionOverrides: {
      type: Schema.Types.Mixed,
      default: undefined,
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
