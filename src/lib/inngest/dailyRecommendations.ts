/**
 * Daily Job Recommendations — Inngest Cron Function
 *
 * Runs daily at 9 AM UTC. For each active job seeker:
 *   1. Check notification preferences (skip if jobs category disabled or unsubscribed)
 *   2. Run match scoring against active jobs (reuses matchScore.ts)
 *   3. Pick top 5 jobs scoring ≥ 40
 *   4. Aggregate profile views from last 24h
 *   5. Emit "notification/daily-digest" event with combined data
 *
 * Processes users in batches of 50 for reliability (Inngest retries per batch).
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
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
  type JobProfile,
} from "@/lib/matchScore";
import { isCronEnabled, updateCronRunStatus } from "@/models/SystemConfig";

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
const MIN_HOURS_BETWEEN_DIGESTS = 23;

export const dailyRecommendationsCron = inngest.createFunction(
  {
    id: "daily-job-recommendations",
    name: "Daily Job Recommendations",
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ cron: "0 9 * * *" }], // 9 AM UTC daily
  },
  async ({ step }: { step: any }) => {
    await step.run("connect-db", () => connectDB());

    // Check if admin has enabled this cron
    const enabled = await step.run("check-enabled", () => isCronEnabled("dailyRecommendations"));
    if (!enabled) {
      await step.run("log-skipped", () => updateCronRunStatus("dailyRecommendations", "success", "Skipped — disabled by admin"));
      return { skipped: true, reason: "disabled by admin" };
    }

    // Fetch all active job seekers who have email enabled for jobs
    const seekerUserIds = await step.run("fetch-eligible-seekers", async () => {
      // Get all job_seeker users who are active
      const seekerUsers = await User.find({
        role: "job_seeker",
        isActive: true,
        isEmailVerified: true,
      })
        .select("_id")
        .lean();

      const userIds = seekerUsers.map((u) => u._id.toString());

      // Filter by notification preferences
      const prefsToExclude = await NotificationPreference.find({
        userId: { $in: userIds },
        $or: [
          { unsubscribedAll: true },
          { "categories.jobs.enabled": false },
          { emailFrequency: "none" },
        ],
      })
        .select("userId")
        .lean();

      const excludeSet = new Set(
        prefsToExclude.map((p) => p.userId.toString()),
      );

      // Also exclude users who received a digest in the last 23 hours
      const recentDigests = await NotificationPreference.find({
        userId: { $in: userIds },
        lastDigestSentAt: {
          $gte: new Date(Date.now() - MIN_HOURS_BETWEEN_DIGESTS * 60 * 60 * 1000),
        },
      })
        .select("userId")
        .lean();

      for (const rd of recentDigests) {
        excludeSet.add(rd.userId.toString());
      }

      return userIds.filter((id) => !excludeSet.has(id));
    });

    if (seekerUserIds.length === 0) {
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
    const totalBatches = Math.ceil(seekerUserIds.length / BATCH_SIZE);
    let totalEmitted = 0;

    for (let i = 0; i < totalBatches; i++) {
      const batchIds = seekerUserIds.slice(
        i * BATCH_SIZE,
        (i + 1) * BATCH_SIZE,
      );

      const batchResult = await step.run(
        `process-batch-${i}`,
        async () => {
          let emitted = 0;

          for (const userId of batchIds) {
            try {
              // Fetch seeker profile
              const seeker = await JobSeeker.findOne({ userId })
                .select(
                  "skills preferredCountries preferredRoles preferredSalary preferredJobType experience",
                )
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

              // Score and rank jobs
              const scoredJobs = activeJobs
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
              const recentViews = await ProfileView.find({
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
              console.error(
                `[daily-recommendations] Error processing user ${userId}:`,
                err,
              );
            }
          }

          return emitted;
        },
      );

      totalEmitted += batchResult;
    }

    return {
      processed: seekerUserIds.length,
      emitted: totalEmitted,
      batches: totalBatches,
    };
  },
);
