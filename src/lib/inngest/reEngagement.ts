/**
 * Re-engagement & Profile Completion — Inngest Cron Functions
 *
 * Re-engagement: runs daily at 10 AM UTC.
 *   Targets job seekers inactive for 7+ days with a 14-day cooldown.
 *
 * Profile Completion: runs daily at 10:30 AM UTC.
 *   Targets seekers with < 70% profile completeness, registered > 3 days ago,
 *   14-day cooldown between reminders.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import NotificationPreference from "@/models/NotificationPreference";
import {
  calculateMatchScore,
  seekerProfileFromDoc,
  jobProfileFromDoc,
} from "@/lib/matchScore";
import { sendEmail } from "@/lib/communications/email";
import { isCronEnabled, updateCronRunStatus } from "@/models/SystemConfig";

interface ActiveJobDoc {
  _id: unknown;
  title: string;
  requirements?: { skills?: string[]; experienceMin?: number; experienceMax?: number };
  salary?: { min?: number; max?: number };
  location?: { country?: string; isRemote?: boolean };
  employerId?: { companyName?: string } | null;
}

const RE_ENGAGEMENT_INACTIVE_DAYS = 7;
const RE_ENGAGEMENT_COOLDOWN_DAYS = 14;
const PROFILE_COMPLETION_THRESHOLD = 70;
const PROFILE_COMPLETION_MIN_AGE_DAYS = 3;

// ─── Re-engagement Cron ───────────────────────────────────────────────

export const reEngagementCron = inngest.createFunction(
  {
    id: "re-engagement-emails",
    name: "Re-engagement Emails",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ cron: "0 10 * * *" }], // 10 AM UTC daily
  },
  async ({ step }: { step: any }) => {
    await step.run("connect-db", () => connectDB());

    // Check if admin has enabled this cron
    const enabled = await step.run("check-enabled", () => isCronEnabled("reEngagement"));
    if (!enabled) {
      await step.run("log-skipped", () => updateCronRunStatus("reEngagement", "success", "Skipped — disabled by admin"));
      return { skipped: true, reason: "disabled by admin" };
    }

    const now = new Date();
    const inactiveThreshold = new Date(
      now.getTime() - RE_ENGAGEMENT_INACTIVE_DAYS * 24 * 60 * 60 * 1000,
    );
    const cooldownThreshold = new Date(
      now.getTime() - RE_ENGAGEMENT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );

    // Find inactive job seekers
    const inactiveUsers = await step.run("find-inactive-users", async () => {
      const users = await User.find({
        role: "job_seeker",
        isActive: true,
        isEmailVerified: true,
        $or: [
          { lastLogin: { $lt: inactiveThreshold } },
          { lastLogin: { $exists: false } },
        ],
      })
        .select("_id name email locale lastLogin")
        .lean();

      // Filter out users who received re-engagement recently
      const userIds = users.map((u) => u._id.toString());
      const recentlySent = await NotificationPreference.find({
        userId: { $in: userIds },
        $or: [
          { lastReEngagementSentAt: { $gte: cooldownThreshold } },
          { unsubscribedAll: true },
          { "categories.marketing.enabled": false },
        ],
      })
        .select("userId")
        .lean();

      const excludeSet = new Set(recentlySent.map((p) => p.userId.toString()));
      return users.filter((u) => !excludeSet.has(u._id.toString()));
    });

    if (inactiveUsers.length === 0) {
      return { processed: 0, reason: "no inactive users" };
    }

    // Fetch active jobs for matching
    const activeJobs: ActiveJobDoc[] = await step.run("fetch-jobs", async () => {
      return Job.find({
        status: "active",
        $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
      })
        .select("title requirements salary location employerId")
        .populate("employerId", "companyName")
        .limit(200)
        .lean();
    });

    let sent = 0;

    // Process each inactive user
    for (const user of inactiveUsers.slice(0, 100)) {
      // Cap at 100 per run
      try {
        await step.run(`re-engage-${user._id}`, async () => {
          const seeker = await JobSeeker.findOne({ userId: user._id })
            .select(
              "skills preferredCountries preferredRoles preferredSalary preferredJobType experience",
            )
            .lean();

          if (!seeker) return;

          const seekerProfile = seekerProfileFromDoc(seeker);

          // Find matching jobs
          const matchedJobs = activeJobs
            .map((j) => ({
              title: j.title,
              company:
                (j.employerId as { companyName?: string } | null)?.companyName ??
                "Company",
              matchScore: calculateMatchScore(seekerProfile, jobProfileFromDoc(j)),
            }))
            .filter((j) => j.matchScore >= 40)
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 3);

          // Only send if there are matching jobs to show
          if (matchedJobs.length === 0) return;

          const daysSinceLogin = user.lastLogin
            ? Math.floor(
                (now.getTime() - new Date(user.lastLogin).getTime()) /
                  (24 * 60 * 60 * 1000),
              )
            : 30;

          const isAr = user.locale === "ar";
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";

          const html = buildReEngagementEmail({
            userName: user.name,
            locale: user.locale ?? "en",
            matchCount: matchedJobs.length,
            topJobs: matchedJobs,
            daysSinceLogin,
            baseUrl,
          });

          await sendEmail({
            to: user.email,
            subject: isAr
              ? `${matchedJobs.length} وظائف جديدة في انتظارك`
              : `${matchedJobs.length} new jobs waiting for you`,
            html,
          });

          // Update cooldown timestamp
          await NotificationPreference.updateOne(
            { userId: user._id },
            { $set: { lastReEngagementSentAt: new Date() } },
            { upsert: true },
          );

          sent++;
        });
      } catch (err) {
        console.error(
          `[re-engagement] Error for user ${user._id}:`,
          err,
        );
      }
    }

    return { processed: inactiveUsers.length, sent };
  },
);

// ─── Profile Completion Reminder Cron ─────────────────────────────────

export const profileCompletionCron = inngest.createFunction(
  {
    id: "profile-completion-reminders",
    name: "Profile Completion Reminders",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ cron: "30 10 * * *" }], // 10:30 AM UTC daily
  },
  async ({ step }: { step: any }) => {
    await step.run("connect-db", () => connectDB());

    // Check if admin has enabled this cron
    const enabled = await step.run("check-enabled", () => isCronEnabled("profileCompletion"));
    if (!enabled) {
      await step.run("log-skipped", () => updateCronRunStatus("profileCompletion", "success", "Skipped — disabled by admin"));
      return { skipped: true, reason: "disabled by admin" };
    }

    const now = new Date();
    const minAgeThreshold = new Date(
      now.getTime() - PROFILE_COMPLETION_MIN_AGE_DAYS * 24 * 60 * 60 * 1000,
    );
    const cooldownThreshold = new Date(
      now.getTime() - RE_ENGAGEMENT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );

    const incompleteSeekers = await step.run(
      "find-incomplete-seekers",
      async () => {
        const seekers = await JobSeeker.find({
          profileCompleteness: { $lt: PROFILE_COMPLETION_THRESHOLD },
          createdAt: { $lt: minAgeThreshold },
        })
          .select("userId profileCompleteness")
          .lean();

        const userIds = seekers.map((s) =>
          (s.userId as { toString(): string }).toString(),
        );

        // Filter by preferences and cooldown
        const excludePrefs = await NotificationPreference.find({
          userId: { $in: userIds },
          $or: [
            { unsubscribedAll: true },
            { "categories.marketing.enabled": false },
          ],
        })
          .select("userId")
          .lean();

        const excludeSet = new Set(
          excludePrefs.map((p) => p.userId.toString()),
        );

        return seekers.filter(
          (s) =>
            !excludeSet.has(
              (s.userId as { toString(): string }).toString(),
            ),
        );
      },
    );

    let sent = 0;

    for (const seeker of incompleteSeekers.slice(0, 50)) {
      try {
        await step.run(
          `profile-reminder-${(seeker.userId as { toString(): string }).toString()}`,
          async () => {
            const userId = (seeker.userId as { toString(): string }).toString();
            const user = await User.findById(userId)
              .select("name email locale")
              .lean();
            if (!user?.email) return;

            const isAr = user.locale === "ar";
            const baseUrl =
              process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
            const completeness = seeker.profileCompleteness ?? 0;

            const html = buildProfileCompletionEmail({
              userName: user.name,
              locale: user.locale ?? "en",
              completeness,
              baseUrl,
            });

            await sendEmail({
              to: user.email,
              subject: isAr
                ? `ملفك الشخصي مكتمل ${completeness}% — أكمله الآن`
                : `Your profile is ${completeness}% complete — finish it now`,
              html,
            });

            sent++;
          },
        );
      } catch (err) {
        console.error(`[profile-completion] Error:`, err);
      }
    }

    return { processed: incompleteSeekers.length, sent };
  },
);

// ─── Email Templates ──────────────────────────────────────────────────

interface ReEngagementEmailData {
  userName: string;
  locale: string;
  matchCount: number;
  topJobs: Array<{ title: string; company: string; matchScore: number }>;
  daysSinceLogin: number;
  baseUrl: string;
}

function buildReEngagementEmail(data: ReEngagementEmailData): string {
  const { userName, locale, matchCount, topJobs, daysSinceLogin, baseUrl } =
    data;
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const jobList = topJobs
    .map(
      (j) => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
        <strong style="color: #111827;">${esc(j.title)}</strong>
        <br><span style="color: #6b7280; font-size: 13px;">${esc(j.company)} · ${j.matchScore}% ${isAr ? "تطابق" : "match"}</span>
      </td>
    </tr>`,
    )
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: ${dir};">
      <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <p>${isAr ? `مرحباً <strong>${esc(userName)}</strong>` : `Hi <strong>${esc(userName)}</strong>`},</p>
        <p style="color: #374151; font-size: 16px;">
          ${isAr ? `لاحظنا أنك لم تزرنا منذ ${daysSinceLogin} يوم. في هذه الأثناء، ${matchCount} وظيفة جديدة تطابق ملفك الشخصي!` : `We noticed you haven't visited in ${daysSinceLogin} days. Meanwhile, ${matchCount} new jobs match your profile!`}
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          ${jobList}
        </table>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${baseUrl}/${locale}/job-seeker/jobs" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            ${isAr ? "تصفح الوظائف" : "Browse Jobs"}
          </a>
        </div>
      </div>
      <div style="padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #f9fafb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
          <a href="${baseUrl}/${locale}/job-seeker/settings/notifications" style="color: #6b7280;">${isAr ? "إدارة التفضيلات" : "Manage preferences"}</a> |
          <a href="${baseUrl}/api/unsubscribe?ref=re-engagement" style="color: #6b7280;">${isAr ? "إلغاء الاشتراك" : "Unsubscribe"}</a>
        </p>
      </div>
    </div>
  `;
}

interface ProfileCompletionEmailData {
  userName: string;
  locale: string;
  completeness: number;
  baseUrl: string;
}

function buildProfileCompletionEmail(data: ProfileCompletionEmailData): string {
  const { userName, locale, completeness, baseUrl } = data;
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const remaining = 100 - completeness;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: ${dir};">
      <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <p>${isAr ? `مرحباً <strong>${esc(userName)}</strong>` : `Hi <strong>${esc(userName)}</strong>`},</p>
        <p style="color: #374151;">
          ${isAr ? `ملفك الشخصي مكتمل بنسبة ${completeness}% فقط. أكمل الـ ${remaining}% المتبقية لتحصل على مشاهدات أكثر بـ 3 أضعاف من مسؤولي التوظيف.` : `Your profile is only ${completeness}% complete. Finish the remaining ${remaining}% to get 3x more recruiter views.`}
        </p>
        <div style="background: #f3f4f6; border-radius: 8px; height: 12px; margin: 16px 0; overflow: hidden;">
          <div style="background: #0D6FD8; height: 100%; width: ${completeness}%; border-radius: 8px;"></div>
        </div>
        <p style="text-align: center; color: #6b7280; font-size: 14px;">${completeness}% ${isAr ? "مكتمل" : "complete"}</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${baseUrl}/${locale}/job-seeker/profile" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            ${isAr ? "أكمل ملفك الشخصي" : "Complete Your Profile"}
          </a>
        </div>
      </div>
      <div style="padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #f9fafb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
          <a href="${baseUrl}/${locale}/job-seeker/settings/notifications" style="color: #6b7280;">${isAr ? "إدارة التفضيلات" : "Manage preferences"}</a> |
          <a href="${baseUrl}/api/unsubscribe?ref=profile" style="color: #6b7280;">${isAr ? "إلغاء الاشتراك" : "Unsubscribe"}</a>
        </p>
      </div>
    </div>
  `;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
