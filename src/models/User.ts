import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
export type { UserRole, PermissionMode, CustomPermissions }; // re-export for backwards compatibility

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  permissionMode: PermissionMode;
  customPermissions?: CustomPermissions;
  locale: "en" | "ar";
  isActive: boolean;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  avatar?: string;
  phone?: string;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, select: false },
    role: {
      type: String,
      enum: ["admin", "super_agent", "agent", "employer", "job_seeker"],
      required: true,
    },
    permissionMode: {
      type: String,
      enum: ["role_default", "custom"],
      default: "role_default",
    },
    customPermissions: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    locale: { type: String, enum: ["en", "ar"], default: "en" },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpiry: { type: Date, select: false },
    avatar: { type: String },
    phone: { type: String },
    lastLogin: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_, ret) {
        delete ret.passwordHash;
        delete ret.emailVerificationToken;
        delete ret.passwordResetToken;
        return ret;
      },
    },
  }
);

// Indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: -1 });

// Password comparison method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export const User =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
export default User;
