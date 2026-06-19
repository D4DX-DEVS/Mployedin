import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { escapeRegex } from "@/lib/security/sanitize";
import { sendEmail } from "@/lib/communications/email";
import SavedSearch from "@/models/SavedSearch";
import Job from "@/models/Job";
import User from "@/models/User";
import NotificationPreference from "@/models/NotificationPreference";

/**
 * GET /api/cron/saved-search-alerts — runs hourly.
 *
 * Emails job seekers the NEW jobs matching their saved searches since the last
 * alert. Supports per-search frequency: instant (~hourly), daily, weekly.
 *
 * Dedup / no-duplicate guarantees:
 *  - Only jobs created after the search's lastNotifiedAt are considered.
 *  - Each search is claimed with an atomic compare-and-swap on lastNotifiedAt,
 *    so two overlapping runs can never email the same search twice.
 *  - On send failure the claim is rolled back so the search retries next run.
 *
 * Scale: due searches are selected via the
 * { emailAlert, frequency, lastNotifiedAt } index, paginated by _id cursor
 * (no skip), and processed with bounded concurrency under a wall-clock budget.
 */
export const maxDuration = 60;

const SEARCH_BATCH = 500;
const CONCURRENCY = 10;
const MATCH_LIMIT = 10;
const TIME_BUDGET_MS = 50_000;

// Cooldowns: a search is "due" when lastNotifiedAt is null or older than this.
// Slightly under the nominal interval so an hourly run never skips a cycle.
const INSTANT_MS = 50 * 60 * 1000; // ~hourly
const DAILY_MS = 23 * 60 * 60 * 1000;
const WEEKLY_MS = 167 * 60 * 60 * 1000;

const EMPLOYMENT_TYPES = new Set([
  "full_time", "part_time", "contract", "internship", "freelance", "walk_in",
]);
const WORK_MODES = new Set(["onsite", "hybrid", "remote"]);

interface SearchLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  query: string;
  filters?: { location?: string; jobType?: string; experienceLevel?: string; salary?: string };
  frequency: string;
  lastNotifiedAt?: Date | null;
  createdAt: Date;
}

interface JobLean {
  _id: Types.ObjectId;
  title: string;
  location?: { country?: string; city?: string; isRemote?: boolean };
  employerId?: { companyName?: string } | null;
  createdAt: Date;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildJobQuery(search: SearchLean, since: Date, now: Date): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const and: Record<string, any>[] = [
    { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {
    status: "active",
    deletedAt: null,
    createdAt: { $gt: since },
  };

  const text = search.query?.trim();
  if (text) query.$text = { $search: text.slice(0, 200) };

  const filters = search.filters ?? {};
  if (filters.location) {
    const rx = new RegExp(escapeRegex(String(filters.location).slice(0, 100)), "i");
    and.push({ $or: [{ "location.country": rx }, { "location.city": rx }] });
  }
  if (filters.jobType) {
    const norm = normalizeToken(String(filters.jobType));
    if (WORK_MODES.has(norm)) query.workMode = norm;
    else if (EMPLOYMENT_TYPES.has(norm)) query.employmentType = norm;
  }

  // Experience level — mirrors the job-feed thresholds (entry <3y, mid 3-6y,
  // senior 6y+) against requirements.experienceMin. Entry also matches jobs that
  // never set a minimum (treated as 0, same as the feed's `?? 0`).
  if (filters.experienceLevel) {
    const level = normalizeToken(String(filters.experienceLevel));
    if (level === "entry") {
      and.push({
        $or: [
          { "requirements.experienceMin": { $lt: 3 } },
          { "requirements.experienceMin": { $exists: false } },
          { "requirements.experienceMin": null },
        ],
      });
    } else if (level === "mid") {
      and.push({ "requirements.experienceMin": { $gte: 3, $lt: 6 } });
    } else if (level === "senior") {
      and.push({ "requirements.experienceMin": { $gte: 6 } });
    }
  }

  query.$and = and;
  return query;
}

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const instantT = new Date(now.getTime() - INSTANT_MS);
  const dailyT = new Date(now.getTime() - DAILY_MS);
  const weeklyT = new Date(now.getTime() - WEEKLY_MS);

  // Due = matching frequency AND (never notified OR cooled down).
  const dueOr = [
    { $and: [{ frequency: "instant" }, { $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lte: instantT } }] }] },
    { $and: [{ frequency: "daily" }, { $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lte: dailyT } }] }] },
    { $and: [{ frequency: "weekly" }, { $or: [{ lastNotifiedAt: null }, { lastNotifiedAt: { $lte: weeklyT } }] }] },
  ];

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "https://mployedin.com";
  const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

  let searchesChecked = 0;
  let matchedSearches = 0;
  let emailsSent = 0;
  const errors: string[] = [];
  let lastId: Types.ObjectId | null = null;
  let truncated = false;
  const startedAt = Date.now();

  const rollback = async (id: Types.ObjectId, prev: Date | null | undefined) => {
    if (prev) await SavedSearch.updateOne({ _id: id }, { $set: { lastNotifiedAt: prev } });
    else await SavedSearch.updateOne({ _id: id }, { $unset: { lastNotifiedAt: "" } });
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchFilter: Record<string, any> = { emailAlert: true, $or: dueOr };
    if (lastId) batchFilter._id = { $gt: lastId };

    const searches = await SavedSearch.find(batchFilter)
      .sort({ _id: 1 })
      .limit(SEARCH_BATCH)
      .lean<SearchLean[]>();

    if (searches.length === 0) break;
    lastId = searches[searches.length - 1]._id;
    searchesChecked += searches.length;

    const tasks = searches.map((s) => async () => {
      const prev = s.lastNotifiedAt ?? null;

      // Atomic compare-and-swap: only one runner advances this search.
      const claim = await SavedSearch.findOneAndUpdate(
        { _id: s._id, emailAlert: true, lastNotifiedAt: prev },
        { $set: { lastNotifiedAt: now } },
      ).lean<SearchLean>();
      if (!claim) return; // already claimed by a concurrent run

      const since = prev ?? new Date(s.createdAt);

      let jobs: JobLean[];
      try {
        jobs = await Job.find(buildJobQuery(s, since, now))
          .select("title location employerId createdAt")
          .populate("employerId", "companyName")
          .sort({ createdAt: -1 })
          .limit(MATCH_LIMIT)
          .lean<JobLean[]>();
      } catch (err) {
        await rollback(s._id, prev);
        if (errors.length < 10) errors.push(`search ${s._id}: query ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      if (!jobs || jobs.length === 0) return; // window advanced, nothing new

      const [user, pref] = await Promise.all([
        User.findById(s.userId).select("name email locale").lean<{ name?: string; email?: string; locale?: string }>(),
        NotificationPreference.findOne({ userId: s.userId })
          .select("unsubscribedAll categories")
          .lean<{ unsubscribedAll?: boolean; categories?: { jobs?: { enabled?: boolean } } }>(),
      ]);

      if (!user?.email) return;
      if (pref?.unsubscribedAll) return;
      if (pref?.categories?.jobs?.enabled === false) return;

      matchedSearches++;

      const locale = user.locale === "ar" ? "ar" : "en";
      const isAr = locale === "ar";
      const unsubToken = secret
        ? jwt.sign(
            { userId: String(s.userId), savedSearchId: String(s._id), action: "unsubscribe" },
            secret,
            { expiresIn: "90d" },
          )
        : "";

      const html = buildSavedSearchEmail({
        userName: user.name ?? (isAr ? "باحث عن عمل" : "there"),
        locale,
        searchName: s.name,
        jobs: jobs.map((j) => ({
          jobId: String(j._id),
          title: j.title,
          company: j.employerId?.companyName ?? (isAr ? "شركة" : "Company"),
          location: j.location?.isRemote
            ? (isAr ? "عن بُعد" : "Remote")
            : [j.location?.city, j.location?.country].filter(Boolean).join(", ") || (isAr ? "مرن" : "Flexible"),
          postedAgo: relativeAge(j.createdAt, isAr),
        })),
        baseUrl,
        manageUrl: `${baseUrl}/${locale}/job-seeker/jobs`,
        unsubUrl: unsubToken ? `${baseUrl}/api/unsubscribe?token=${unsubToken}` : `${baseUrl}/api/unsubscribe`,
      });

      const subject = isAr
        ? `${jobs.length} وظيفة جديدة لبحثك المحفوظ "${s.name}"`
        : `${jobs.length} new job${jobs.length > 1 ? "s" : ""} for your saved search "${s.name}"`;

      try {
        await sendEmail({
          to: user.email,
          subject,
          html,
          userId: String(s.userId),
          source: "saved-search-alerts",
          category: "jobs",
        });
        emailsSent++;
        await SavedSearch.updateOne({ _id: s._id }, { $set: { resultCount: jobs.length } });
      } catch (err) {
        await rollback(s._id, prev);
        if (errors.length < 10) errors.push(`search ${s._id}: email ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.allSettled(tasks.slice(i, i + CONCURRENCY).map((t) => t()));
    }

    if (searches.length < SEARCH_BATCH) break;
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      truncated = true;
      break;
    }
  }

  return NextResponse.json({
    message: "Saved search alerts processed",
    searchesChecked,
    matchedSearches,
    emailsSent,
    truncated: truncated || undefined,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}

// ── Email template (XSS-safe; mirrors lib/inngest/similarJobsEmail.ts) ────────

function relativeAge(createdAt: Date | undefined, isAr: boolean): string {
  if (!createdAt) return "";
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days <= 0) return isAr ? "اليوم" : "Today";
  if (days === 1) return isAr ? "منذ يوم" : "1 day ago";
  if (days < 7) return isAr ? `منذ ${days} أيام` : `${days} days ago`;
  return isAr ? `منذ ${Math.floor(days / 7)} أسابيع` : `${Math.floor(days / 7)}w ago`;
}

const LOGO_COLORS = ["#3b82f6", "#059669", "#8b5cf6", "#d97706", "#e11d48", "#0891b2"];

function logoColor(name: string): string {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

function companyInitials(name: string): string {
  return name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "CO";
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SavedSearchEmailData {
  userName: string;
  locale: "en" | "ar";
  searchName: string;
  jobs: Array<{ jobId: string; title: string; company: string; location: string; postedAgo: string }>;
  baseUrl: string;
  manageUrl: string;
  unsubUrl: string;
}

function buildSavedSearchEmail(data: SavedSearchEmailData): string {
  const { userName, locale, searchName, jobs, baseUrl, manageUrl, unsubUrl } = data;
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const sideStart = isAr ? "right" : "left";
  const sideEnd = isAr ? "left" : "right";

  const jobRows = jobs
    .map((j) => {
      const bgColor = logoColor(j.company);
      const initials = companyInitials(j.company);
      return `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="width: 48px; vertical-align: top;">
                <div style="width: 44px; height: 44px; border-radius: 10px; background: ${bgColor}; color: white; font-size: 14px; font-weight: 700; text-align: center; line-height: 44px;">${esc(initials)}</div>
              </td>
              <td style="padding-${sideStart}: 12px; vertical-align: top;">
                <a href="${baseUrl}/${locale}/job-seeker/jobs/${encodeURIComponent(j.jobId)}" style="color: #0D6FD8; text-decoration: none; font-weight: 600; font-size: 15px;">${esc(j.title)}</a>
                <p style="margin: 2px 0 0; color: #374151; font-size: 13px; font-weight: 500;">${esc(j.company)}</p>
                <p style="margin: 2px 0 0; color: #6b7280; font-size: 12px;">📍 ${esc(j.location)}</p>
                ${j.postedAgo ? `<p style="margin: 2px 0 0; color: #9ca3af; font-size: 11px;">${esc(j.postedAgo)}</p>` : ""}
              </td>
              <td style="text-align: ${sideEnd}; vertical-align: middle; width: 70px;">
                <a href="${baseUrl}/${locale}/job-seeker/jobs/${encodeURIComponent(j.jobId)}" style="background: #eff6ff; color: #0D6FD8; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap;">${isAr ? "عرض" : "View"}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: ${dir};">
      <div style="background: linear-gradient(135deg, #0D6FD8 0%, #0a2a6e 100%); padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px; letter-spacing: 1px;">MPLOYEDIN</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; line-height: 1.6;">${isAr ? "مرحباً" : "Hi"} <strong>${esc(userName)}</strong>,</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
          ${isAr
            ? `إليك وظائف جديدة تطابق بحثك المحفوظ <strong>${esc(searchName)}</strong>:`
            : `Here are new jobs matching your saved search <strong>${esc(searchName)}</strong>:`}
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-top: 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">${jobRows}</table>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${manageUrl}" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">${isAr ? "تصفح جميع الوظائف" : "Browse all jobs"}</a>
        </div>
      </div>
      <div style="padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #f9fafb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
          <a href="${manageUrl}" style="color: #6b7280;">${isAr ? "إدارة عمليات البحث المحفوظة" : "Manage saved searches"}</a> |
          <a href="${unsubUrl}" style="color: #6b7280;">${isAr ? "إلغاء الاشتراك في هذا التنبيه" : "Unsubscribe from this alert"}</a>
        </p>
      </div>
    </div>
  `;
}
