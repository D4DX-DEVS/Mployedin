import mongoose, { Document, Schema } from "mongoose";

export type EmailFrequency = "instant" | "daily" | "weekly" | "none";
export type NotificationChannel = "in_app" | "email" | "whatsapp";

export interface CategoryPreference {
  enabled: boolean;
  channels: NotificationChannel[];
}

export interface INotificationPreference extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  emailFrequency: EmailFrequency;
  categories: {
    jobs: CategoryPreference;
    applications: CategoryPreference;
    interviews: CategoryPreference;
    offers: CategoryPreference;
    profile_views: CategoryPreference;
    marketing: CategoryPreference;
    system: CategoryPreference;
  };
  unsubscribedAll: boolean;
  dailyDigestTime: string; // "HH:mm" format, default "09:00"
  timezone: string;
  lastEmailSentAt?: Date;
  lastDigestSentAt?: Date;
  lastReEngagementSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CategoryPreferenceSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    channels: [
      {
        type: String,
        enum: ["in_app", "email", "whatsapp"],
      },
    ],
  },
  { _id: false },
);

const DEFAULT_CHANNELS: NotificationChannel[] = ["in_app", "email"];

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    emailFrequency: {
      type: String,
      enum: ["instant", "daily", "weekly", "none"],
      default: "daily",
    },
    categories: {
      jobs: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: DEFAULT_CHANNELS }),
      },
      applications: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: DEFAULT_CHANNELS }),
      },
      interviews: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: DEFAULT_CHANNELS }),
      },
      offers: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: DEFAULT_CHANNELS }),
      },
      profile_views: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: ["in_app", "email"] }),
      },
      marketing: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: false, channels: ["email"] }),
      },
      system: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: ["in_app", "email"] }),
      },
    },
    unsubscribedAll: { type: Boolean, default: false },
    dailyDigestTime: { type: String, default: "09:00" },
    timezone: { type: String, default: "Asia/Dubai" },
    lastEmailSentAt: Date,
    lastDigestSentAt: Date,
    lastReEngagementSentAt: Date,
  },
  { timestamps: true },
);

NotificationPreferenceSchema.index({ userId: 1 }, { unique: true });
NotificationPreferenceSchema.index({ emailFrequency: 1, unsubscribedAll: 1 });

/**
 * Get or create notification preferences for a user.
 * Returns existing prefs or creates defaults.
 */
export async function getOrCreatePreferences(
  userId: string,
): Promise<INotificationPreference> {
  let prefs = await NotificationPreference.findOne({ userId });
  if (!prefs) {
    prefs = await NotificationPreference.create({ userId });
  }
  return prefs;
}

/**
 * Map notification type to preference category key.
 */
export function typeToCategory(
  type: string,
): keyof INotificationPreference["categories"] {
  switch (type) {
    case "application_received":
    case "application_status_update":
    case "application_update":
      return "applications";
    case "interview_scheduled":
    case "interview_reminder":
    case "interview_update":
      return "interviews";
    case "offer_update":
      return "offers";
    case "job_posted":
    case "job_approved":
    case "job_rejected":
      return "jobs";
    case "profile_update":
      return "profile_views";
    case "payment":
    case "verification":
    case "system":
    case "lead_converted":
    case "mention":
    case "message":
      return "system";
    default:
      return "system";
  }
}

export const NotificationPreference =
  mongoose.models.NotificationPreference ||
  mongoose.model<INotificationPreference>(
    "NotificationPreference",
    NotificationPreferenceSchema,
  );
export default NotificationPreference;
