import mongoose, { Schema, Document } from "mongoose";

export interface ISystemSettings extends Document {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  updatedAt: Date;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    platformName: { type: String, default: "MPLOYEDIN" },
    supportEmail: { type: String, default: "support@mployedin.com" },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SystemSettings =
  mongoose.models.SystemSettings ||
  mongoose.model<ISystemSettings>("SystemSettings", SystemSettingsSchema);

export default SystemSettings;
