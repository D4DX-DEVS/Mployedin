import mongoose, { Document, Schema } from "mongoose";

/**
 * SystemConfig — platform-wide settings controlled by admin.
 * Singleton pattern: always one document with key "notification_system".
 *
 * Controls which cron jobs are enabled, global email defaults,
 * and system-wide overrides.
 */

export interface CronJobConfig {
  enabled: boolean;
  lastRunAt?: Date;
  lastRunStatus?: "success" | "error";
  lastRunMessage?: string;
}

export interface ISystemConfig extends Document {
  _id: mongoose.Types.ObjectId;
  key: string; // "notification_system"

  // Cron job toggles — admin can enable/disable each
  cronJobs: {
    dailyRecommendations: CronJobConfig;
    dailyDigestWorker: CronJobConfig;
    reEngagement: CronJobConfig;
    profileCompletion: CronJobConfig;
    weeklyDigest: CronJobConfig;
    jobExpiryAlerts: CronJobConfig;
    emailSequenceSender: CronJobConfig;
  };

  // Global email defaults
  globalDefaults: {
    defaultFrequency: "instant" | "daily" | "weekly" | "none";
    maxEmailsPerUserPerDay: number;
    maintenanceMode: boolean; // Pauses ALL outbound emails
    maintenanceMessage?: string;
  };

  // Admin-managed overrides (force-unsubscribe abusive users, etc.)
  userOverrides: Array<{
    userId: string;
    action: "force_unsubscribe" | "force_instant" | "pause_emails";
    reason: string;
    createdAt: Date;
    createdBy: string; // admin userId who set this
  }>;

  updatedBy?: string; // last admin who modified
  createdAt: Date;
  updatedAt: Date;
}

const CronJobConfigSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    lastRunAt: Date,
    lastRunStatus: { type: String, enum: ["success", "error"] },
    lastRunMessage: String,
  },
  { _id: false },
);

const SystemConfigSchema = new Schema<ISystemConfig>(
  {
    key: { type: String, required: true, unique: true },
    cronJobs: {
      dailyRecommendations: { type: CronJobConfigSchema, default: () => ({ enabled: true }) },
      dailyDigestWorker: { type: CronJobConfigSchema, default: () => ({ enabled: true }) },
      reEngagement: { type: CronJobConfigSchema, default: () => ({ enabled: true }) },
      profileCompletion: { type: CronJobConfigSchema, default: () => ({ enabled: true }) },
      weeklyDigest: { type: CronJobConfigSchema, default: () => ({ enabled: true }) },
      jobExpiryAlerts: { type: CronJobConfigSchema, default: () => ({ enabled: true }) },
      emailSequenceSender: { type: CronJobConfigSchema, default: () => ({ enabled: true }) },
    },
    globalDefaults: {
      defaultFrequency: { type: String, enum: ["instant", "daily", "weekly", "none"], default: "daily" },
      maxEmailsPerUserPerDay: { type: Number, default: 10 },
      maintenanceMode: { type: Boolean, default: false },
      maintenanceMessage: String,
    },
    userOverrides: [
      {
        userId: { type: String, required: true },
        action: { type: String, enum: ["force_unsubscribe", "force_instant", "pause_emails"], required: true },
        reason: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: String, required: true },
      },
    ],
    updatedBy: String,
  },
  { timestamps: true },
);

SystemConfigSchema.index({ key: 1 }, { unique: true });

/**
 * Get or create the notification system config (singleton).
 */
export async function getSystemConfig(): Promise<ISystemConfig> {
  let config = await SystemConfig.findOne({ key: "notification_system" });
  if (!config) {
    config = await SystemConfig.create({ key: "notification_system" });
  }
  return config;
}

/**
 * Check if a specific cron job is enabled.
 * Returns false if maintenanceMode is on or the specific cron is disabled.
 */
export async function isCronEnabled(
  cronKey: keyof ISystemConfig["cronJobs"],
): Promise<boolean> {
  const config = await getSystemConfig();
  if (config.globalDefaults.maintenanceMode) return false;
  return config.cronJobs[cronKey]?.enabled !== false;
}

/**
 * Update a cron job's last run status.
 */
export async function updateCronRunStatus(
  cronKey: keyof ISystemConfig["cronJobs"],
  status: "success" | "error",
  message?: string,
): Promise<void> {
  await SystemConfig.updateOne(
    { key: "notification_system" },
    {
      $set: {
        [`cronJobs.${cronKey}.lastRunAt`]: new Date(),
        [`cronJobs.${cronKey}.lastRunStatus`]: status,
        [`cronJobs.${cronKey}.lastRunMessage`]: message ?? "",
      },
    },
  );
}

/**
 * Check if a user has an admin override (force-unsubscribe, etc.)
 */
export async function getUserOverride(
  userId: string,
): Promise<ISystemConfig["userOverrides"][number] | null> {
  const config = await getSystemConfig();
  return config.userOverrides.find((o) => o.userId === userId) ?? null;
}

export const SystemConfig =
  mongoose.models.SystemConfig ||
  mongoose.model<ISystemConfig>("SystemConfig", SystemConfigSchema);
export default SystemConfig;
