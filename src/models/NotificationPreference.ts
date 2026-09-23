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
  /**
   * How often this user wants batched email — **only when they chose it**.
   *
   * Deliberately optional and without a schema default. It used to default to
   * `"daily"`, which meant every lazily-created document arrived carrying an
   * answer nobody had given: 208 of the 224 live documents held `"daily"` and
   * not one of those users had picked it. `resolveDigestCadence` reads this
   * field *first*, so that default silently overrode both the seeker's stated
   * availability and the admin's platform default, and the product's intended
   * weekly default could never apply to anyone.
   *
   * Absent now means "never chose", which is what lets the fallback chain in
   * digestGate.ts work as designed.
   */
  emailFrequency?: EmailFrequency;
  categories: {
    jobs: CategoryPreference;
    applications: CategoryPreference;
    interviews: CategoryPreference;
    offers: CategoryPreference;
    profile_views: CategoryPreference;
    marketing: CategoryPreference;
    system: CategoryPreference;
    /*
     * Staff categories. The agent and super-agent settings pages have always
     * offered these three, but they were absent here, so Mongoose stripped
     * them out of every update and the toggles reverted on reload while the
     * API still answered 200.
     */
    placements: CategoryPreference;
    commissions: CategoryPreference;
    team: CategoryPreference;
  };
  unsubscribedAll: boolean;
  dailyDigestTime: string; // "HH:mm" format, default "09:00"
  timezone: string;
  lastEmailSentAt?: Date;
  lastDigestSentAt?: Date;
  lastReEngagementSentAt?: Date;
  /**
   * When the seeker was last told "nothing cleared the bar today".
   * Rate-limits the near-miss section so a high match threshold produces one
   * honest note a week rather than a daily reminder of having no matches.
   */
  lastNearMissSentAt?: Date;
  /**
   * Cooldown clock for the profile-completion reminder. The cron documented a
   * 14-day gap and computed the threshold, but never had a field to compare
   * against — so the reminder went out every single day to every seeker under
   * the completeness threshold.
   */
  lastProfileReminderSentAt?: Date;
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

/**
 * Every category and the state it starts in. Also the backfill source: a
 * document written before a category existed has no sub-document for it, and
 * the orchestrator reads `categories[x]?.enabled` — so without this, adding a
 * category would silently stop delivery for everyone who already had a
 * preferences document.
 */
export const CATEGORY_DEFAULTS: Record<string, CategoryPreference> = {
  jobs: { enabled: true, channels: DEFAULT_CHANNELS },
  applications: { enabled: true, channels: DEFAULT_CHANNELS },
  interviews: { enabled: true, channels: DEFAULT_CHANNELS },
  offers: { enabled: true, channels: DEFAULT_CHANNELS },
  profile_views: { enabled: true, channels: DEFAULT_CHANNELS },
  marketing: { enabled: false, channels: ["email"] },
  system: { enabled: true, channels: DEFAULT_CHANNELS },
  placements: { enabled: true, channels: DEFAULT_CHANNELS },
  commissions: { enabled: true, channels: DEFAULT_CHANNELS },
  team: { enabled: true, channels: DEFAULT_CHANNELS },
};

/** The category keys a client may write. */
export const CATEGORY_KEYS = Object.keys(CATEGORY_DEFAULTS) as (keyof INotificationPreference["categories"])[];

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
      // No default — see the interface. An absent value has to stay
      // distinguishable from a chosen one, or the fallback chain is dead.
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
      placements: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: DEFAULT_CHANNELS }),
      },
      commissions: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: DEFAULT_CHANNELS }),
      },
      team: {
        type: CategoryPreferenceSchema,
        default: () => ({ enabled: true, channels: DEFAULT_CHANNELS }),
      },
    },
    unsubscribedAll: { type: Boolean, default: false },
    dailyDigestTime: { type: String, default: "09:00" },
    timezone: { type: String, default: "Asia/Dubai" },
    lastEmailSentAt: Date,
    lastDigestSentAt: Date,
    lastReEngagementSentAt: Date,
    lastNearMissSentAt: Date,
    lastProfileReminderSentAt: Date,
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
    return prefs;
  }

  /*
   * Backfill categories added after this document was written, so a new
   * category behaves like its default rather than like "disabled" — the
   * orchestrator reads `categories[x]?.enabled` and would otherwise stop
   * delivering to everyone who already had a preferences document.
   *
   * Both halves of this are deliberate. The check reads the *stored* document
   * through the driver because Mongoose materialises a single-nested
   * sub-document's defaults in memory: `prefs.categories.placements` is a
   * populated object even when the collection has no such field, so a check
   * against the hydrated document finds nothing missing and writes nothing. The
   * write goes through the driver for the same reason — it must land exactly as
   * given, including the channel list, because a later
   * `$set: { "categories.x.enabled": false }` creates the sub-document with an
   * empty channels array if the field was never stored.
   */
  const stored = await NotificationPreference.collection.findOne(
    { _id: prefs._id },
    { projection: { categories: 1 } },
  );
  const storedCategories = (stored?.categories ?? {}) as Record<string, unknown>;
  const missing = CATEGORY_KEYS.filter((key) => !storedCategories[key]);

  if (missing.length > 0) {
    const updates: Record<string, CategoryPreference> = {};
    for (const key of missing) {
      // Copy the channel array too — every default shares one array instance.
      updates[`categories.${key}`] = {
        ...CATEGORY_DEFAULTS[key],
        channels: [...CATEGORY_DEFAULTS[key].channels],
      };
    }
    await NotificationPreference.collection.updateOne({ _id: prefs._id }, { $set: updates });
    prefs = (await NotificationPreference.findOne({ userId })) ?? prefs;
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
    case "new_job_posted":
      return "jobs";
    case "profile_update":
      return "profile_views";
    // Commission notifications are the only thing that emits "payment"
    // (notifyCommissionApproved / notifyCommissionPaid), and both go to an
    // agent or super-agent — never to an employer or a seeker.
    case "payment":
      return "commissions";
    case "placement":
    case "placement_completed":
      return "placements";
    // "Super agent assignments, team updates, and milestones" — the label the
    // staff settings pages already use for this group.
    case "agent_joined":
    case "target_assigned":
    case "target_updated":
    case "target_at_risk":
    case "target_milestone":
      return "team";
    case "verification":
    case "system":
    case "lead_converted":
    case "mention":
    case "message":
    case "employer_registered":
    case "job_seeker_registered":
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
