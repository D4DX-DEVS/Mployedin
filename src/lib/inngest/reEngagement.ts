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
import logger from "@/lib/logger";
import User from "@/models/User";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import NotificationPreference from "@/models/NotificationPreference";
import {
  profileSignalCount,
  MIN_PROFILE_SIGNALS,
  SEEKER_MATCH_FIELDS,
} from "@/lib/matchScore";
import {
  recommendJobsFor,
  toCandidateJob,
  JOB_MATCH_FIELDS,
} from "@/lib/matching/recommend";
import { prepareSkillVectors } from "@/lib/matching/skillVectors";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import { sendEmail, isUndeliverableAddress } from "@/lib/communications/email";
import { emailHeader, emailProgressBar, emailFooter } from "@/lib/communications/emailLayout";
import {
  profileCompleteness,
  type ProfileCompletenessItem,
} from "@/lib/jobSeeker/profileCompleteness";
import { isCronEnabled, updateCronRunStatus, resolveMatchThreshold, isAiRerankEnabled } from "@/models/SystemConfig";
import { mongoJevVerdictStore } from "@/lib/matching/jevVerdictStore";

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
    await connectDB();

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

    const threshold = await step.run("resolve-threshold", () => resolveMatchThreshold());
    // The same admin switch the daily digest reads. This mail prints a match
    // percentage, and it has to be the number the digest and the app show.
    const useAi = await step.run("resolve-ai-rerank", () => isAiRerankEnabled());

    // Fetch active jobs for matching. `workMode` joins the projection so the
    // seeker's remote/onsite preference is actually enforced.
    const activeJobs = await step.run("fetch-jobs", async () => {
      const jobs = await Job.find({
        status: "active",
        $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
      })
        .select(JOB_MATCH_FIELDS)
        .populate("employerId", "companyName")
        .limit(200)
        .lean();
      return jobs.map((j) => toCandidateJob(j as unknown as Record<string, unknown>));
    });

    let sent = 0;

    // Process each inactive user
    for (const user of inactiveUsers.slice(0, 100)) {
      // Cap at 100 per run
      try {
        await step.run(`re-engage-${user._id}`, async () => {
          const seeker = await JobSeeker.findOne({ userId: user._id })
            .select(SEEKER_MATCH_FIELDS)
            .lean();

          if (!seeker) return;

          // Effective profile (base + confirmed skills), as every surface uses.
          const seekerProfile = await effectiveSeekerProfile(String(user._id), seeker);

          // A profile that states almost nothing cannot be matched honestly —
          // every component reads an unstated field as neutral, so the
          // percentages would be made of defaults. Those seekers belong to the
          // profile-completion cron below, not to a "jobs waiting for you"
          // mail. The daily digest has applied this gate for a while; this
          // surface never did.
          if (profileSignalCount(seekerProfile) < MIN_PROFILE_SIGNALS) return;

          // Find matching jobs through the shared pipeline. This used to score
          // inline at a floor of 40 — below the level at which a profile that
          // states nothing scores against every job on the board — and with no
          // profile-signal gate, so blank profiles were told three jobs were
          // waiting for them.
          const vectors = await prepareSkillVectors(activeJobs, [seekerProfile]);
          const recommendation = await recommendJobsFor(seekerProfile, activeJobs, {
            threshold,
            limit: 3,
            useAi,
            vectors,
            verdicts: mongoJevVerdictStore,
          });
          const matchedJobs = recommendation.jobs.map((j) => ({
            title: j.title,
            company: j.company,
            matchScore: j.score,
          }));

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
            userId: String(user._id),
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
            // Adds the one-click List-Unsubscribe header; see dailyDigestWorker.
            userId: String(user._id),
            category: "re-engagement",
            source: "re-engagement",
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
        logger.error({ err, userId: user._id }, "[re-engagement] Error processing user");
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
    await connectDB();

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
        // Query wide, decide narrow. The stored `profileCompleteness` is only
        // as fresh as the last write path that bothered to recompute it, and
        // several that edit seeker fields never did — so a stored value is
        // evidence of nothing on its own. Pull the fields the formula reads and
        // score each document live below.
        const seekers = await JobSeeker.find({
          createdAt: { $lt: minAgeThreshold },
        })
          .select(
            "userId profileCompleteness nationality currentLocation summary " +
              "skills experience education languages linkedin socialLinks",
          )
          .lean();

        const userIds = seekers.map((s) =>
          (s.userId as { toString(): string }).toString(),
        );

        // Filter by preferences and cooldown. The cooldown clause is the one
        // that was missing: this cron computed `cooldownThreshold` and then
        // never compared anything against it, so its documented 14-day gap was
        // never enforced and every seeker under the threshold was reminded
        // again every single morning.
        const excludePrefs = await NotificationPreference.find({
          userId: { $in: userIds },
          $or: [
            { lastProfileReminderSentAt: { $gte: cooldownThreshold } },
            { unsubscribedAll: true },
            { "categories.marketing.enabled": false },
          ],
        })
          .select("userId")
          .lean();

        const excludeSet = new Set(
          excludePrefs.map((p) => p.userId.toString()),
        );

        const targets: Array<{
          userId: string;
          score: number;
          missing: ProfileCompletenessItem[];
          done: number;
          total: number;
        }> = [];

        for (const s of seekers) {
          const userId = (s.userId as { toString(): string }).toString();
          if (excludeSet.has(userId)) continue;

          const result = profileCompleteness(s as Parameters<typeof profileCompleteness>[0]);

          // Heal the drift we just measured, so the profile page, the admin
          // seeker lists and the talent-search sort all agree with this email.
          if (result.score !== (s.profileCompleteness ?? -1)) {
            await JobSeeker.updateOne(
              { userId: s.userId },
              { $set: { profileCompleteness: result.score } },
            );
          }

          if (result.score >= PROFILE_COMPLETION_THRESHOLD) continue;
          targets.push({
            userId,
            score: result.score,
            missing: result.missing,
            done: result.done.length,
            total: result.total,
          });
        }

        return targets;
      },
    );

    let sent = 0;

    for (const seeker of incompleteSeekers.slice(0, 50)) {
      try {
        await step.run(
          `profile-reminder-${seeker.userId}`,
          async () => {
            const user = await User.findById(seeker.userId)
              .select("name email locale")
              .lean();
            if (!user?.email) return;
            // sendEmail throws on reserved domains, which Inngest would retry.
            // Skip seed accounts here so a permanent failure never becomes a
            // retry loop. (Same guard as the daily digest producer.)
            if (isUndeliverableAddress(user.email)) return;

            const isAr = user.locale === "ar";
            const baseUrl =
              process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
            const completeness = seeker.score;

            const html = buildProfileCompletionEmail({
              userId: String(seeker.userId),
              userName: user.name,
              locale: user.locale ?? "en",
              completeness,
              done: seeker.done,
              total: seeker.total,
              missing: seeker.missing,
              baseUrl,
            });

            await sendEmail({
              to: user.email,
              subject: isAr
                ? `ملفك الشخصي مكتمل ${completeness}% — أكمله الآن`
                : `Your profile is ${completeness}% complete — finish it now`,
              html,
              userId: String(seeker.userId),
              category: "re-engagement",
              source: "profile-reminder",
            });

            // Start the cooldown only once the send actually succeeded, so a
            // failed reminder is retried tomorrow rather than suppressed for
            // a fortnight.
            await NotificationPreference.updateOne(
              { userId: seeker.userId },
              { $set: { lastProfileReminderSentAt: new Date() } },
              { upsert: true },
            );

            sent++;
          },
        );
      } catch (err) {
        logger.error({ err }, "[profile-completion] Error processing seeker");
      }
    }

    return { processed: incompleteSeekers.length, sent };
  },
);

// ─── Email Templates ──────────────────────────────────────────────────

interface ReEngagementEmailData {
  /** Signs the footer's unsubscribe link; without it the link is left out. */
  userId?: string;
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
      ${emailHeader(undefined, { baseUrl })}
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
      ${emailFooter({
        locale,
        baseUrl,
        reason: isAr
          ? "تتلقى هذا البريد لأن توصيات الوظائف مفعّلة لديك."
          : "You're receiving this because you have job recommendations enabled.",
        unsubRef: "re-engagement",
        // The category this cron checks before sending (categories.marketing).
        userId: data.userId,
        unsubCategory: "marketing",
      })}
    </div>
  `;
}

export interface ProfileCompletionEmailData {
  /** Signs the footer's unsubscribe link; without it the link is left out. */
  userId?: string;
  userName: string;
  locale: string;
  completeness: number;
  /** How many scored fields are already filled in. */
  done: number;
  /** How many scored fields exist in total. */
  total: number;
  /** The fields still outstanding, heaviest first. */
  missing: ProfileCompletenessItem[];
  baseUrl: string;
}

/**
 * Copy for each scored field. The old email hardcoded four actions with invented
 * boosts — it promised "Attach Resume ↑ Boost 10%" even though the CV is not part
 * of the completeness formula at all, and offered "Add Skills ↑ 8%" when skills
 * are worth 20. Every row here is generated from the real missing fields and
 * carries that field's real weight, so the numbers add up to the percentage
 * shown at the top of the email.
 */
const COMPLETION_COPY: Record<
  ProfileCompletenessItem["key"],
  { en: { label: string; desc: string }; ar: { label: string; desc: string } }
> = {
  userId: {
    en: { label: "Create your profile", desc: "Your account is the starting point" },
    ar: { label: "أنشئ ملفك الشخصي", desc: "حسابك هو نقطة البداية" },
  },
  nationality: {
    en: { label: "Add your nationality", desc: "Employers filter by work eligibility" },
    ar: { label: "أضف جنسيتك", desc: "يصفّي أصحاب العمل حسب أهلية العمل" },
  },
  currentLocation: {
    en: { label: "Add your current location", desc: "Surfaces roles near you" },
    ar: { label: "أضف موقعك الحالي", desc: "يُظهر الوظائف القريبة منك" },
  },
  summary: {
    en: { label: "Write a profile summary", desc: "The first thing recruiters read" },
    ar: { label: "اكتب نبذة عنك", desc: "أول ما يقرأه مسؤولو التوظيف" },
  },
  skills: {
    en: { label: "Add your skills", desc: "The single biggest factor in job matching" },
    ar: { label: "أضف مهاراتك", desc: "العامل الأكبر في مطابقة الوظائف" },
  },
  experience: {
    en: { label: "Add your work experience", desc: "Showcase your roles & responsibilities" },
    ar: { label: "أضف خبراتك المهنية", desc: "اعرض أدوارك ومسؤولياتك" },
  },
  education: {
    en: { label: "Add your education", desc: "Many roles screen on qualifications" },
    ar: { label: "أضف مؤهلاتك الدراسية", desc: "تعتمد وظائف كثيرة على المؤهلات" },
  },
  languages: {
    en: { label: "Add languages you speak", desc: "Essential for Gulf and multilingual roles" },
    ar: { label: "أضف اللغات التي تتحدثها", desc: "أساسية لوظائف الخليج والوظائف متعددة اللغات" },
  },
  linkedin: {
    en: { label: "Link your LinkedIn profile", desc: "Adds credibility to your application" },
    ar: { label: "اربط حسابك على لينكدإن", desc: "يضيف مصداقية لطلبك" },
  },
};

export function buildProfileCompletionEmail(data: ProfileCompletionEmailData): string {
  const { userName, locale, completeness, done, total, missing, baseUrl } = data;
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";

  // Only ever ask for what is actually missing, heaviest first, capped so the
  // email stays a nudge rather than a form.
  const actions = missing
    .filter((item) => item.key !== "userId")
    .slice(0, 5)
    .map((item) => {
    const copy = COMPLETION_COPY[item.key][isAr ? "ar" : "en"];
    return { label: copy.label, boost: item.weight, desc: copy.desc };
  });

  const actionRows = actions
    .map(
      (a) => `
    <tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="vertical-align: top;">
              <strong style="color: #111827; font-size: 14px;">${esc(a.label)}</strong>
              <span style="color: #059669; font-size: 13px; font-weight: 600; ${isAr ? "margin-right" : "margin-left"}: 8px;">↑ ${isAr ? "زيادة" : "Boost"} ${a.boost}%</span>
              <br><span style="color: #6b7280; font-size: 12px;">${esc(a.desc)}</span>
            </td>
            <td style="text-align: ${isAr ? "left" : "right"}; vertical-align: middle; width: 60px;">
              <a href="${baseUrl}/${locale}/job-seeker/profile" style="color: #0D6FD8; font-size: 13px; font-weight: 600; text-decoration: none; border: 1px solid #0D6FD8; border-radius: 6px; padding: 4px 12px; display: inline-block;">
                ${isAr ? "أضف" : "Add"}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`,
    )
    .join("");

  // Counts are a fraction of the fields the formula actually scores. The old
  // copy divided the percentage into a fictitious 15 actions and zero-padded
  // the result, so an untouched profile read "00 actions completed + 15 actions
  // pending" — two numbers that corresponded to nothing.
  const pendingActions = total - done;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: ${dir};">
      ${emailHeader(undefined, { baseUrl })}
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; line-height: 1.6;">${isAr ? `مرحباً <strong>${esc(userName)}</strong>` : `Hi <strong>${esc(userName)}</strong>`},</p>

        <!-- Progress section -->
        <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 16px 0; text-align: center; border: 1px solid #e5e7eb;">
          <p style="margin: 0 0 4px; color: #111827; font-size: 16px; font-weight: 600;">
            ${isAr ? `ملفك الشخصي مكتمل بنسبة ${completeness}%، لماذا يجب أن تصل لـ 100%` : `Your profile is ${completeness}% complete, here is why you should aim for a 100%`}
          </p>

          ${emailProgressBar(completeness, { rtl: isAr })}

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-top: 14px;">
            <tr>
              <td align="center" style="color: #374151; font-size: 13px; line-height: 20px; font-family: Arial, sans-serif;">
                <span style="color: #059669;">&#10004;</span>
                ${isAr ? `${done} من ${total} مكتملة` : `${done} of ${total} completed`}
                <span style="color: #9ca3af;">&nbsp;·&nbsp;</span>
                <span style="color: #b45309;">${isAr ? `${pendingActions} متبقية` : `${pendingActions} to go`}</span>
              </td>
            </tr>
          </table>
        </div>

        <!-- Benefits -->
        <div style="margin: 20px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0;">
                <span style="display: inline-block; width: 24px; height: 24px; background: #dbeafe; color: #1d4ed8; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">1</span>
                <span style="color: #374151; font-size: 14px; margin-${isAr ? "right" : "left"}: 8px;">
                  ${isAr ? "فرص أعلى للتواصل من مسؤولي التوظيف" : "Higher chances of being contacted by recruiters"}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0;">
                <span style="display: inline-block; width: 24px; height: 24px; background: #fef3c7; color: #b45309; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">2</span>
                <span style="color: #374151; font-size: 14px; margin-${isAr ? "right" : "left"}: 8px;">
                  ${isAr ? "تميّز بين ملايين الباحثين عن عمل" : "Stand out amidst millions of other jobseekers"}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0;">
                <span style="display: inline-block; width: 24px; height: 24px; background: #dcfce7; color: #15803d; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">3</span>
                <span style="color: #374151; font-size: 14px; margin-${isAr ? "right" : "left"}: 8px;">
                  ${isAr ? "احصل على توصيات وظائف مخصصة لك" : "Get personalised job recommendations"}
                </span>
              </td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 20px 0;">
          <a href="${baseUrl}/${locale}/job-seeker/profile" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            ${isAr ? "أكمل ملفي الشخصي" : "Complete my profile"}
          </a>
        </div>

        <!-- Action items with boost % -->
        <div style="margin-top: 24px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
            <strong style="color: #111827; font-size: 14px;">
              ${isAr ? "عزّز ملفك الشخصي بإضافة التفاصيل المفقودة" : "Enhance your profile by adding missing details!"}
            </strong>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            ${actionRows}
          </table>
        </div>

        <!-- Did you know section -->
        <div style="margin-top: 24px; text-align: center; padding: 16px; background: #faf5ff; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #7c3aed;">
            ${isAr ? "هل تعلم؟" : "Did you know?"}
          </p>
          <p style="margin: 8px 0 0; color: #6b7280; font-size: 13px;">
            ${isAr ? "70% من مسؤولي التوظيف يبحثون عن المرشحين بناءً على ملفاتهم الشخصية دون نشر وظائف" : "70% recruiters search candidates based on their profile without posting jobs"}
          </p>
          <a href="${baseUrl}/${locale}/job-seeker/profile" style="color: #0D6FD8; font-size: 13px; text-decoration: none; display: inline-block; margin-top: 8px;">
            ${isAr ? "أضف التفاصيل المفقودة →" : "Add missing details →"}
          </a>
        </div>
      </div>
      ${emailFooter({
        locale,
        baseUrl,
        reason: isAr
          ? "تتلقى هذا البريد لأن ملفك الشخصي غير مكتمل."
          : "You're receiving this because your profile is incomplete.",
        unsubRef: "profile",
        userId: data.userId,
        unsubCategory: "marketing",
      })}
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
