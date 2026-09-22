import mongoose, { Document, Schema } from "mongoose";
import { DEFAULT_MIN_RELEVANCE } from "@/lib/matching/constants";
import type { DigestCadence } from "@/lib/notifications/digestGate";

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
    emailSequenceSender: CronJobConfig;
  };

  // Global email defaults
  globalDefaults: {
    defaultFrequency: "instant" | "daily" | "weekly" | "none";
    maxEmailsPerUserPerDay: number;
    maintenanceMode: boolean; // Pauses ALL outbound emails
    maintenanceMessage?: string;
  };

  /**
   * Job-matching policy. One threshold for every surface that decides whether
   * a job is good enough to put in front of a human — the digests, the
   * re-engagement mail, the similar-jobs mail and the in-app list. It used to
   * be hard-coded three different ways (50 / 40 / 40 / none), so the same job
   * could be withheld by one surface and mailed by another on the same day.
   */
  matching: {
    /** Minimum relevance (0–100) to list or email a job. */
    minScore: number;
    /** Let Jev re-rank the shortlist. Off falls back to the deterministic score alone. */
    aiRerank: boolean;
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
      emailSequenceSender: { type: CronJobConfigSchema, default: () => ({ enabled: true }) },
    },
    globalDefaults: {
      // Weekly, not daily: see resolveDefaultDigestCadence() for why. Changing
      // this in the admin UI now actually changes what seekers receive.
      defaultFrequency: { type: String, enum: ["instant", "daily", "weekly", "none"], default: "weekly" },
      maxEmailsPerUserPerDay: { type: Number, default: 10 },
      maintenanceMode: { type: Boolean, default: false },
      maintenanceMessage: String,
    },
    matching: {
      minScore: { type: Number, default: DEFAULT_MIN_RELEVANCE, min: 0, max: 100 },
      aiRerank: { type: Boolean, default: true },
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
 * The relevance floor every recommendation surface must honour.
 *
 * Falls back to the compiled default when the config document predates this
 * field or the value is nonsense, so a bad admin edit degrades to the product
 * default instead of mailing everything (0) or nothing (100).
 */
export async function resolveMatchThreshold(): Promise<number> {
  try {
    const config = await getSystemConfig();
    const raw = config.matching?.minScore;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw <= 100) return raw;
  } catch {
    // Config unreadable — the default is the safe answer, not an exception
    // thrown into a cron batch.
  }
  return DEFAULT_MIN_RELEVANCE;
}

/**
 * How often a seeker with no saved preference hears from the recommendation
 * engine.
 *
 * `globalDefaults.defaultFrequency` was admin-editable from
 * /admin/settings/notifications but read by nothing — every seeker got the
 * schema default of daily regardless of what the admin picked. It is wired
 * here, and the default is now weekly: on a 62-job board with an 80% relevance
 * floor, a daily run has something to say to about ten people, and mails the
 * other two hundred nothing while still paying to score them.
 *
 * Seekers who want daily can still choose it; that matches what Indeed,
 * Naukri, Bayt and LinkedIn all offer.
 */
export async function resolveDefaultDigestCadence(): Promise<DigestCadence> {
  try {
    const config = await getSystemConfig();
    const raw = config.globalDefaults?.defaultFrequency;
    if (raw === "weekly" || raw === "none") return raw;
    if (raw === "daily" || raw === "instant") return "daily";
  } catch {
    // Unreadable config must not throw into a cron batch.
  }
  return "weekly";
}

/** Whether Jev may re-rank the shortlist. Defaults to on. */
export async function isAiRerankEnabled(): Promise<boolean> {
  try {
    const config = await getSystemConfig();
    return config.matching?.aiRerank !== false;
  } catch {
    return false;
  }
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
