/**
 * Similar Jobs Email — Inngest Function
 *
 * Triggered 2 hours after a job application. Finds similar active jobs
 * and emails the seeker a "More jobs like X" email (Bayt-style).
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import NotificationPreference from "@/models/NotificationPreference";
import { sendEmail } from "@/lib/communications/email";
import { unsubscribeUrl } from "@/lib/communications/unsubscribeLink";
import { SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import {
  recommendJobsFor,
  toCandidateJob,
  JOB_MATCH_FIELDS,
} from "@/lib/matching/recommend";
import { prepareSkillVectors } from "@/lib/matching/skillVectors";
import { resolveMatchThreshold, isAiRerankEnabled } from "@/models/SystemConfig";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import { mongoJevVerdictStore } from "@/lib/matching/jevVerdictStore";

/** What find-similar-jobs hands to the email builder. */
interface ScoredSimilarJob {
  id: string;
  title: string;
  company: string;
  location: string;
  score: number;
  /** False when there was no profile to score against, so no badge is drawn. */
  showScore: boolean;
  createdAt?: Date | string;
}

export const similarJobsAfterApply = inngest.createFunction(
  {
    id: "similar-jobs-after-apply",
    name: "Similar Jobs After Application",
    retries: 2,
    // Inngest free plan caps concurrency at 5 (sync is rejected above that).
    concurrency: { limit: 5 },
    triggers: [{ event: "jobs/similar-after-apply" }],
  },
  async ({ event, step }: { event: { data: { userId: string; jobId: string; jobTitle: string; companyName: string } }; step: any }) => {
    const { userId, jobId, jobTitle, companyName } = event.data;

    // Wait 2 hours before sending
    await step.sleep("wait-2h", "2h");

    await connectDB();

    // Check user preferences
    const canSend = await step.run("check-prefs", async () => {
      const pref = await NotificationPreference.findOne({ userId }).lean();
      if (!pref) return true; // Default: send
      if ((pref as { unsubscribedAll?: boolean }).unsubscribedAll) return false;
      const cats = (pref as { categories?: { jobs?: { enabled?: boolean } } }).categories;
      return cats?.jobs?.enabled !== false;
    });

    if (!canSend) return { skipped: true, reason: "user opted out" };

    // Find the applied job to get its skills/tags
    const result = await step.run("find-similar-jobs", async () => {
      const appliedJob = await Job.findById(jobId)
        .select("requirements tags location")
        .lean();
      if (!appliedJob) return null;

      const skills = appliedJob.requirements?.skills ?? [];
      const tags = appliedJob.tags ?? [];
      const searchTerms = [...skills, ...tags];

      if (searchTerms.length === 0) return null;

      // Find similar active jobs
      const similarJobs = await Job.find({
        _id: { $ne: jobId },
        status: "active",
        $or: [
          { "requirements.skills": { $in: searchTerms } },
          { tags: { $in: searchTerms } },
        ],
      })
        .populate("employerId", "companyName")
        .select(`${JOB_MATCH_FIELDS} tags`)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      if (similarJobs.length === 0) return null;

      // Score them against the seeker profile.
      //
      // Without a profile there is nothing to score against, so the five most
      // recent similar jobs are the honest answer — but they go out without a
      // match percentage, because a number we did not compute must not be
      // printed as if we had.
      const seeker = await JobSeeker.findOne({ userId }).select(SEEKER_MATCH_FIELDS).lean();
      const candidates = similarJobs.map((j) => toCandidateJob(j as unknown as Record<string, unknown>));
      if (!seeker) {
        return { jobs: candidates.slice(0, 5).map((j) => ({ ...j, score: 0, showScore: false })) };
      }

      // Effective profile (base + confirmed skills), as every surface uses.
      const seekerProfile = await effectiveSeekerProfile(String(userId), seeker);
      const vectors = await prepareSkillVectors(candidates, [seekerProfile]);
      const threshold = await resolveMatchThreshold();
      const useAi = await isAiRerankEnabled();

      // The same floor as every other recommendation. This mail used half of
      // it — anchored on a job the seeker applied to, the reasoning went, so a
      // lower bar was fair — but it printed those 40% matches with the same
      // percentage badge the digest uses for 80%+, and the product rule is that
      // nothing under the floor is recommended anywhere. Fewer of these mails
      // will go out; the ones that do mean what they say.
      const recommendation = await recommendJobsFor(seekerProfile, candidates, {
        threshold,
        limit: 5,
        useAi,
        vectors,
        verdicts: mongoJevVerdictStore,
      });
      if (recommendation.jobs.length === 0) return null;
      return { jobs: recommendation.jobs.map((j) => ({ ...j, showScore: true })) };
    });

    if (!result || result.jobs.length === 0) {
      return { skipped: true, reason: "no similar jobs" };
    }

    // Send the email
    await step.run("send-email", async () => {
      const user = await User.findById(userId).select("name email locale").lean();
      if (!user?.email) return;

      const locale = user.locale ?? "en";
      const isAr = locale === "ar";
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";

      const html = buildSimilarJobsEmail({
        userId: String(userId),
        userName: user.name,
        locale,
        appliedJobTitle: jobTitle,
        appliedCompany: companyName,
        // The pipeline already resolved company, location and score; this
        // block used to re-derive them from the raw document, which is how the
        // two drifted apart in the first place.
        similarJobs: (result.jobs as ScoredSimilarJob[]).map((j) => ({
          jobId: j.id,
          title: j.title,
          company: j.company,
          location: j.location || "Flexible",
          matchScore: j.showScore ? j.score : undefined,
          postedAgo: relativeAge(j.createdAt),
        })),
        baseUrl,
      });

      const subject = isAr
        ? `وظائف أخرى مشابهة لـ ${jobTitle} في ${companyName}`
        : `More jobs like ${jobTitle} at ${companyName} and others`;

      await sendEmail({
        to: user.email,
        subject,
        html,
        userId,
        source: "similar-jobs",
        category: "jobs",
      });
    });

    return { sent: true, userId, similarCount: result.jobs.length };
  },
);

function relativeAge(createdAt?: Date | string): string {
  if (!createdAt) return "";
  const diff = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `30+ days ago`;
}

interface SimilarJobsEmailData {
  /** Signs the footer's unsubscribe link; without it the link is left out. */
  userId?: string;
  userName: string;
  locale: string;
  appliedJobTitle: string;
  appliedCompany: string;
  similarJobs: Array<{
    jobId: string;
    title: string;
    company: string;
    location: string;
    /** Omitted when we had no profile to score against — see find-similar-jobs. */
    matchScore?: number;
    postedAgo: string;
  }>;
  baseUrl: string;
}

const LOGO_COLORS = ["#3b82f6", "#059669", "#8b5cf6", "#d97706", "#e11d48", "#0891b2"];

function logoColor(name: string): string {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

function companyInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function buildSimilarJobsEmail(data: SimilarJobsEmailData): string {
  const { userName, locale, appliedJobTitle, appliedCompany, similarJobs, baseUrl } = data;
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";
  // Scoped to `jobs`, the category the check-prefs step above reads. Was
  // `?ref=similar-jobs` with no token, which the route rejects.
  const unsubHref = data.userId
    ? unsubscribeUrl(baseUrl, data.userId, { category: "jobs", ref: "similar-jobs" })
    : null;
  const unsubLink = unsubHref
    ? ` |
          <a href="${unsubHref.replace(/&/g, "&amp;")}" style="color: #6b7280;">${isAr ? "إلغاء الاشتراك" : "Unsubscribe"}</a>`
    : "";

  const jobRows = similarJobs
    .map((j) => {
      const bgColor = logoColor(j.company);
      const initials = companyInitials(j.company);
      const score = j.matchScore;
      const matchBg = score === undefined ? "#9ca3af" : score >= 80 ? "#059669" : score >= 60 ? "#0D6FD8" : "#d97706";

      return `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="width: 48px; vertical-align: top;">
                <div style="width: 44px; height: 44px; border-radius: 10px; background: ${bgColor}; color: white; font-size: 14px; font-weight: 700; text-align: center; line-height: 44px;">
                  ${initials}
                </div>
              </td>
              <td style="padding-${isAr ? "right" : "left"}: 12px; vertical-align: top;">
                <a href="${baseUrl}/${locale}/job-seeker/jobs/${j.jobId}" style="color: #0D6FD8; text-decoration: none; font-weight: 600; font-size: 15px;">${esc(j.title)}</a>
                <p style="margin: 2px 0 0; color: #374151; font-size: 13px; font-weight: 500;">${esc(j.company)}</p>
                <p style="margin: 2px 0 0; color: #6b7280; font-size: 12px;">📍 ${esc(j.location)}</p>
                ${j.postedAgo ? `<p style="margin: 2px 0 0; color: #9ca3af; font-size: 11px;">${j.postedAgo}</p>` : ""}
              </td>
              <td style="text-align: ${isAr ? "left" : "right"}; vertical-align: top; width: 80px;">
                ${score === undefined ? "" : `<span style="background: ${matchBg}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; display: inline-block;">${score}%</span>`}
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
        <p style="color: #374151; line-height: 1.6;">
          ${isAr ? `مرحباً <strong>${esc(userName)}</strong>` : `Hi <strong>${esc(userName)}</strong>`},
        </p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
          ${isAr
            ? `لقد تقدمت مؤخراً لوظيفة <strong>${esc(appliedJobTitle)}</strong> في <strong>${esc(appliedCompany)}</strong>. وجدنا لك وظائف مشابهة قد تهمك:`
            : `You recently applied for <strong>${esc(appliedJobTitle)}</strong> at <strong>${esc(appliedCompany)}</strong>. We found similar roles that match your profile:`
          }
        </p>

        <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-top: 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            ${jobRows}
          </table>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${baseUrl}/${locale}/job-seeker/jobs" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            ${isAr ? "تصفح المزيد من الوظائف" : "Browse More Jobs"}
          </a>
        </div>
      </div>
      <div style="padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #f9fafb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
          <a href="${baseUrl}/${locale}/job-seeker/settings/notifications" style="color: #6b7280;">${isAr ? "إدارة التفضيلات" : "Manage preferences"}</a>${unsubLink}
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
