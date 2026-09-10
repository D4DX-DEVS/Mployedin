/**
 * Daily Job Recommendations — Inngest Cron Function
 *
 * Runs daily at 9 AM UTC. For each active job seeker:
 *   1. Resolve the digest gate (see digestGate.ts) — each half of the digest is
 *      switched on or off on its own, so "Job Match Alerts: off" silences the
 *      job section without also hiding who viewed the profile
 *   2. Run match scoring against active jobs (reuses matchScore.ts)
 *   3. Pick top 5 jobs scoring ≥ 40
 *   4. Aggregate profile views from last 24h
 *   5. Raise the in-app "new jobs matching you" bell entry
 *   6. Emit "notification/daily-digest" event with combined data
 *
 * This is the platform's ONLY "new jobs for you" push. A second daily cron
 * (/api/cron/job-alerts, 07:00 UTC) used to send its own, weaker version of the
 * same email two hours earlier; it was deleted rather than kept in sync.
 *
 * Processes users in batches of 50 for reliability (Inngest retries per batch).
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import User from "@/models/User";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import ProfileView from "@/models/ProfileView";
import NotificationPreference from "@/models/NotificationPreference";
import {
  calculateMatchScore,
  seekerProfileFromDoc,
  jobProfileFromDoc,
  SEEKER_MATCH_FIELDS,
  type JobProfile,
} from "@/lib/matchScore";
import { isCronEnabled, updateCronRunStatus } from "@/models/SystemConfig";
import { digestGateFor, type DigestGate } from "@/lib/notifications/digestGate";
import { notify } from "@/lib/notifications/trigger";

interface ActiveJob {
  _id: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  salary?: { min?: number; max?: number };
  requirements?: { skills?: string[]; experienceMin?: number; experienceMax?: number };
  jobProfile: JobProfile;
}

const BATCH_SIZE = 50;
const MIN_MATCH_SCORE = 40;
const TOP_JOBS_COUNT = 5;

export const dailyRecommendationsCron = inngest.createFunction(
  {
    id: "daily-job-recommendations",
    name: "Daily Job Recommendations",
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ cron: "0 9 * * *" }], // 9 AM UTC daily
  },
  async ({ step }: { step: any }) => {
    await connectDB();

    // Check if admin has enabled this cron
    const enabled = await step.run("check-enabled", () => isCronEnabled("dailyRecommendations"));
    if (!enabled) {
      await step.run("log-skipped", () => updateCronRunStatus("dailyRecommendations", "success", "Skipped — disabled by admin"));
      return { skipped: true, reason: "disabled by admin" };
    }

    // Resolve, per seeker, which halves of the digest they still want. A seeker
    // is dropped here only when they want neither — the jobs/profile-view
    // switches are applied inside the batch so one can be off without the other.
    const gates = await step.run("fetch-eligible-seekers", async () => {
      // Get all job_seeker users who are active
      const seekerUsers = await User.find({
        role: "job_seeker",
        isActive: true,
        isEmailVerified: true,
      })
        .select("_id")
        .lean();

      const userIds = seekerUsers.map((u) => u._id.toString());
      if (userIds.length === 0) return [] as Array<{ userId: string; gate: DigestGate }>;

      const prefs = await NotificationPreference.find({ userId: { $in: userIds } })
        .select("userId unsubscribedAll emailFrequency lastDigestSentAt categories")
        .lean();

      const prefByUser = new Map(prefs.map((p) => [p.userId.toString(), p]));
      const now = new Date();

      return userIds
        .map((userId) => ({ userId, gate: digestGateFor(prefByUser.get(userId), { now }) }))
        .filter((entry) => entry.gate.send);
    });

    if (gates.length === 0) {
      return { processed: 0, reason: "no eligible seekers" };
    }

    // Fetch active jobs once (shared across all batches)
    const activeJobs: ActiveJob[] = await step.run("fetch-active-jobs", async () => {
      const now = new Date();
      const jobs = await Job.find({
        status: "active",
        $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
      })
        .select("title requirements salary location employerId")
        .populate("employerId", "companyName")
        .limit(500)
        .lean();

      return jobs.map((j): ActiveJob => ({
        _id: (j._id as { toString(): string }).toString(),
        title: j.title,
        company:
          (j.employerId as { companyName?: string } | null)?.companyName ??
          "Company",
        location: j.location?.country ?? "",
        isRemote: j.location?.isRemote ?? false,
        salary: j.salary,
        requirements: j.requirements,
        jobProfile: jobProfileFromDoc(j),
      }));
    });

    // Process in batches
    const totalBatches = Math.ceil(gates.length / BATCH_SIZE);
    let totalEmitted = 0;

    for (let i = 0; i < totalBatches; i++) {
      const batch: Array<{ userId: string; gate: DigestGate }> = gates.slice(
        i * BATCH_SIZE,
        (i + 1) * BATCH_SIZE,
      );

      const batchResult = await step.run(
        `process-batch-${i}`,
        async () => {
          let emitted = 0;

          for (const { userId, gate } of batch) {
            try {
              // Fetch seeker profile
              const seeker = await JobSeeker.findOne({ userId })
                .select(SEEKER_MATCH_FIELDS)
                .lean();

              if (!seeker) continue;

              const seekerProfile = seekerProfileFromDoc(seeker);
              const seekerId = (seeker as unknown as { _id: unknown })._id;

              // Get already-applied job IDs
              const appliedJobIds = new Set(
                await Application.find({ jobSeekerId: seekerId })
                  .select("jobId")
                  .lean()
                  .then((apps) =>
                    apps.map((a) => (a.jobId as { toString(): string }).toString()),
                  ),
              );

              // Score and rank jobs — skipped outright when the seeker turned
              // job match alerts off.
              const scoredJobs = !gate.jobs
                ? []
                : activeJobs
                    .filter((j) => !appliedJobIds.has(j._id))
                    .map((j) => ({
                      ...j,
                      matchScore: calculateMatchScore(seekerProfile, j.jobProfile),
                    }))
                    .filter((j) => j.matchScore >= MIN_MATCH_SCORE)
                    .sort((a, b) => b.matchScore - a.matchScore)
                    .slice(0, TOP_JOBS_COUNT);

              // Aggregate profile views from last 24h
              const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
              const recentViews = !gate.profileViews
                ? []
                : await ProfileView.find({
                    jobSeekerId: userId,
                    viewedAt: { $gte: yesterday },
                    notifiedAt: { $exists: false },
                  })
                    .populate("viewerId", "name")
                    .lean();

              const profileViews = {
                count: recentViews.length,
                viewers: recentViews.map((v) => ({
                  name:
                    (v.viewerId as { name?: string } | null)?.name ??
                    "A recruiter",
                  role: v.viewerRole,
                })),
              };

              // Skip if nothing to send
              if (scoredJobs.length === 0 && profileViews.count === 0) {
                continue;
              }

              // Fetch user details for email
              const user = await User.findById(userId)
                .select("name email locale")
                .lean();
              if (!user?.email) continue;

              // Emit digest event
              await inngest.send({
                name: "notification/daily-digest",
                data: {
                  userId,
                  userName: user.name,
                  email: user.email,
                  locale: user.locale ?? "en",
                  jobs: scoredJobs.map((j) => ({
                    jobId: j._id,
                    title: j.title,
                    company: j.company,
                    location: j.location,
                    matchScore: j.matchScore,
                    salary: j.salary,
                  })),
                  profileViews,
                },
              });

              // Raise the bell entry too. The digest worker only sends email,
              // so without this the seeker sees nothing in-app about the jobs
              // that were found for them.
              if (scoredJobs.length > 0) {
                const titles = scoredJobs.map((j) => j.title).join(", ");
                const companies = [...new Set(scoredJobs.map((j) => j.company).filter(Boolean))]
                  .slice(0, 3)
                  .join(", ");
                await notify({
                  userId,
                  type: "new_job_posted",
                  title: `${scoredJobs.length} new job${scoredJobs.length > 1 ? "s" : ""} matching your profile`,
                  message: `Top matches: ${titles.slice(0, 100)}${titles.length > 100 ? "…" : ""} at ${companies}`,
                  link: "/job-seeker/jobs",
                  titleKey: "seekerJobMatchesTitle",
                  bodyKey: "seekerJobMatchesBody",
                  params: { count: scoredJobs.length, titles: titles.slice(0, 100), companies },
                  // Email for these jobs is the digest emitted just above —
                  // a second per-seeker email would be the duplicate this
                  // consolidation set out to remove.
                  sendEmail: false,
                });
              }

              // Mark profile views as notified
              if (recentViews.length > 0) {
                const viewIds = recentViews.map((v) => v._id);
                await ProfileView.updateMany(
                  { _id: { $in: viewIds } },
                  { $set: { notifiedAt: new Date() } },
                );
              }

              emitted++;
            } catch (err) {
              logger.error({ err, userId }, "[daily-recommendations] Error processing user");
            }
          }

          return emitted;
        },
      );

      totalEmitted += batchResult;
    }

    return {
      processed: gates.length,
      emitted: totalEmitted,
      batches: totalBatches,
    };
  },
);
