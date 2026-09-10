import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { validateBody } from "@/lib/validators";
import { jobSeekerSettingsSchema } from "@/lib/validators/job-seekers";
import { logActivity } from "@/lib/audit/log";
import NotificationPreference from "@/models/NotificationPreference";

interface JobSeekerSettings {
  autoApply: boolean;
  autoApplyFilters: {
    minScore: number;
    maxDistance: string;
    onlyVerifiedEmployers: boolean;
  };
  instantBooking: boolean;
  /** Mirrors the root JobSeeker.profileVisibility; never stored under settings. */
  profileVisibility?: "visible" | "hidden";
  showSalary: boolean;
  openToRelocation: boolean;
  timezone?: string;
  timeBuffer?: number;
  weeklyAvailability?: string[];
  availableHours?: { day: string; startTime: string; endTime: string }[];
  defaultResumeId?: string;
  autoGenerateCoverLetter?: boolean;
  coverLetterTone?: string;
  autoAnswerScreening?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  preferredLocations?: string[];
  /**
   * Mirrors NotificationPreference.categories; never stored under settings. The
   * orchestrator reads those categories for every channel, so a private copy
   * here would be a switch that looked live and changed nothing — which is
   * exactly what it was before.
   */
  notifications?: {
    jobMatchAlerts?: boolean;
    applicationSubmitted?: boolean;
    interviewNotifications?: boolean;
  };
}

/** Which notification category each switch on the Settings page owns. */
const NOTIFICATION_CATEGORY_BY_SWITCH = {
  jobMatchAlerts: "jobs",
  applicationSubmitted: "applications",
  interviewNotifications: "interviews",
} as const;

type NotificationSwitch = keyof typeof NOTIFICATION_CATEGORY_BY_SWITCH;

interface CategoryPreferenceLike {
  enabled?: boolean;
}

/** Every category is opt-out: an absent document or field means still enabled. */
function switchesFromPreferences(
  categories: Record<string, CategoryPreferenceLike | undefined> | undefined,
): Record<NotificationSwitch, boolean> {
  const read = (key: NotificationSwitch) =>
    categories?.[NOTIFICATION_CATEGORY_BY_SWITCH[key]]?.enabled !== false;
  return {
    jobMatchAlerts: read("jobMatchAlerts"),
    applicationSubmitted: read("applicationSubmitted"),
    interviewNotifications: read("interviewNotifications"),
  };
}

interface ResumeDoc {
  id: string;
  name: string;
  url: string;
}

async function getHandler(_req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const js = await (JobSeeker as unknown as {
    findOne: (q: object) => { select: (s: string) => { lean: () => Promise<{ settings?: JobSeekerSettings; documents?: { id: string; name: string; category: string; url: string }[]; profileVisibility?: "visible" | "hidden" } | null> } }
  }).findOne({ userId: ctx.userId }).select("settings documents profileVisibility").lean();

  const prefs = await (NotificationPreference as unknown as {
    findOne: (q: object) => { select: (s: string) => { lean: () => Promise<{ categories?: Record<string, CategoryPreferenceLike | undefined> } | null> } }
  }).findOne({ userId: ctx.userId }).select("categories").lean();

  const defaults: JobSeekerSettings = {
    autoApply: false,
    autoApplyFilters: { minScore: 70, maxDistance: "same_country", onlyVerifiedEmployers: true },
    instantBooking: true,
    showSalary: true,
    openToRelocation: true,
    autoGenerateCoverLetter: true,
    coverLetterTone: "professional",
    autoAnswerScreening: false,
    salaryCurrency: "USD",
  };

  const resumes: ResumeDoc[] = (js?.documents ?? [])
    .filter((d) => d.category === "resume" && d.url)
    .map((d) => ({ id: d.id, name: d.name, url: d.url }));

  return NextResponse.json({
    // Surfaced alongside settings so the form has one shape to hydrate from,
    // while the value itself still lives on the JobSeeker root.
    settings: {
      ...(js?.settings ?? defaults),
      profileVisibility: js?.profileVisibility ?? "visible",
      notifications: switchesFromPreferences(prefs?.categories),
    },
    resumes,
  });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { settings } = await validateBody(req, jobSeekerSettingsSchema);

  // Discoverability is the root field, shared with onboarding and the profile
  // modal. Strip it out so it is written once, in one place, and never shadowed
  // by a stale copy under settings. The notification switches leave the same
  // way — they belong to NotificationPreference.
  const { profileVisibility, notifications, ...settingsFields } = settings;

  if (notifications) {
    const categoryUpdate: Record<string, boolean> = {};
    for (const [key, category] of Object.entries(NOTIFICATION_CATEGORY_BY_SWITCH)) {
      const value = notifications[key as NotificationSwitch];
      if (value !== undefined) categoryUpdate[`categories.${category}.enabled`] = value;
    }
    if (Object.keys(categoryUpdate).length > 0) {
      await (NotificationPreference as unknown as {
        updateOne: (q: object, update: object, opts: object) => Promise<unknown>
      }).updateOne({ userId: ctx.userId }, { $set: categoryUpdate }, { upsert: true });
    }
  }

  // Merge per key rather than `$set: { settings }`. Every field on the schema is
  // optional and the settings form only carries a subset — a wholesale replace
  // silently dropped `autoApply`, `autoApplyFilters` and `applySpeed` (owned by
  // /api/user/autoapply) every time the seeker saved this page.
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settingsFields)) {
    if (value !== undefined) {
      update[`settings.${key}`] = value;
    }
  }
  if (profileVisibility) {
    update.profileVisibility = profileVisibility;
  }

  // Nothing to write on the seeker doc: an all-undefined body would otherwise
  // upsert an empty one. Notification switches were already applied above.
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true });
  }

  await (JobSeeker as unknown as {
    findOneAndUpdate: (q: object, update: object, opts: object) => Promise<unknown>
  }).findOneAndUpdate(
    { userId: ctx.userId },
    { $set: update },
    { upsert: true }
  );

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "job_seeker.update_settings",
    resource: "job_seekers",
    resourceId: ctx.userId,
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
