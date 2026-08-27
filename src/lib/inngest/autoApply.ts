import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import Application from "@/models/Application";
import { ActivityEvent, ACTIVITY_PRIORITY } from "@/models/ActivityEvent";
import Employer from "@/models/Employer";
import { calculateMatchScore, seekerProfileFromDoc, jobProfileFromDoc, SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { computeBehaviorSignals } from "@/lib/behaviorSignals";

const AUTO_APPLY_DAILY_LIMIT = 5;
const MIN_SCORE_FOR_AUTO_APPLY = 60;

/**
 * Inngest v4 function: auto-apply to matching jobs for a job seeker.
 * Triggers: event "job-seeker/auto-apply.triggered" or "job-seeker/auto-apply.cron"
 */
export const autoApplyFunction = inngest.createFunction(
  {
    id: "job-seeker-auto-apply",
    name: "Job Seeker Auto Apply",
    triggers: [
      { event: "job-seeker/auto-apply.triggered" },
      { event: "job-seeker/auto-apply.cron" },
    ],
    // Inngest free plan caps concurrency at 5 (sync is rejected above that).
    concurrency: { limit: 5 },
    retries: 2,
  },
  async ({ event, step }) => {
    const userId = ((event as unknown) as { data: { userId: string } }).data.userId;
    if (!userId) return { skipped: "no userId" };

    await step.run("connect-db", () => connectDB());

    const seeker = await step.run("fetch-seeker", () =>
      JobSeeker.findOne({ userId })
        .select(`_id userId applicationMode autoApplyCount autoApplyResetAt profileCompleteness updatedAt ${SEEKER_MATCH_FIELDS}`)
        .lean()
    );

    if (!seeker) return { skipped: "seeker not found" };
    if (seeker.applicationMode !== "auto") return { skipped: "auto-apply disabled" };

    const now = new Date();
    const todayStart = new Date(now.toDateString());
    const needsReset =
      !seeker.autoApplyResetAt ||
      new Date(seeker.autoApplyResetAt).getTime() < todayStart.getTime();

    if (needsReset) {
      await step.run("reset-daily-count", () =>
        JobSeeker.updateOne({ _id: seeker._id }, { autoApplyCount: 0, autoApplyResetAt: now })
      );
      seeker.autoApplyCount = 0;
    }

    const remaining = AUTO_APPLY_DAILY_LIMIT - (seeker.autoApplyCount ?? 0);
    if (remaining <= 0) return { skipped: "daily limit reached" };

    const seekerProfile = seekerProfileFromDoc(seeker);

    const appliedJobIds = await step.run("fetch-applied-ids", () =>
      Application.find({ jobSeekerId: seeker._id })
        .select("jobId")
        .lean()
        .then((apps) => apps.map((a) => a.jobId))
    );

    const jobQuery: Record<string, unknown> = {
      status: "active",
      _id: { $nin: appliedJobIds },
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
    };
    if (seeker.preferredCountries?.length) {
      jobQuery["$or"] = [
        { "location.country": { $in: seeker.preferredCountries } },
        { "location.isRemote": true },
      ];
    }

    const candidateJobs = await step.run("fetch-jobs", () =>
      Job.find(jobQuery)
        .sort({ createdAt: -1 })
        .limit(100)
        .select("title employerId requirements salary location status")
        .lean()
    ) as Array<Record<string, unknown>>;

    const eligible = candidateJobs
      .map((job) => ({
        job,
        score: calculateMatchScore(seekerProfile, jobProfileFromDoc(job as Parameters<typeof jobProfileFromDoc>[0])),
      }))
      .filter(({ score }) => score >= MIN_SCORE_FOR_AUTO_APPLY)
      .sort((a, b) => b.score - a.score)
      .slice(0, remaining);

    if (eligible.length === 0) return { skipped: "no eligible jobs" };

    let applied = 0;
    for (const { job, score } of eligible) {
      const jobId = String(job._id);
      await step.run(`apply-to-${jobId}`, async () => {
        const dupe = await Application.findOne({ jobSeekerId: seeker._id, jobId: job._id }).lean();
        if (dupe) return;

        const employer = await Employer.findById(job.employerId).select("companyName").lean() as { companyName?: string } | null;
        const company = employer?.companyName ?? "";

        const { signals: bSignals, score: bScore } = computeBehaviorSignals({
          profileCompleteness: (seeker as { profileCompleteness?: number }).profileCompleteness ?? 0,
          documents: [],
          source: "auto_apply",
          autoApplied: true,
          lastActiveAt: (seeker as { updatedAt?: Date }).updatedAt,
        });

        const application = await Application.create({
          jobSeekerId: seeker._id,
          jobId: job._id,
          employerId: job.employerId,
          status: "applied",
          source: "auto_apply",
          autoApplied: true,
          aiMatchScore: score,
          appliedAt: now,
          statusHistory: [{ status: "applied", changedAt: now }],
          behaviorSignals: bSignals,
          behaviorScore: bScore,
        });

        await JobSeeker.updateOne({ _id: seeker._id }, { $inc: { autoApplyCount: 1 } });

        await ActivityEvent.create({
          jobSeekerId: seeker._id,
          type: "application_update",
          priority: ACTIVITY_PRIORITY.application_update,
          metadata: {
            applicationId: String(application._id),
            jobId,
            company,
            title: job.title,
            autoApplied: true,
            matchScore: score,
          },
        });

        applied++;
      });
    }

    return { applied };
  }
);

/**
 * Inngest v4 function: daily reset of autoApplyCount.
 */
export const autoApplyDailyReset = inngest.createFunction(
  {
    id: "job-seeker-auto-apply-daily-reset",
    name: "Auto Apply Daily Reset",
    triggers: [{ cron: "0 0 * * *" }],
  },
  async ({ step }) => {
    await step.run("connect-db", () => connectDB());
    const result = await step.run("reset-counts", () =>
      JobSeeker.updateMany(
        { applicationMode: "auto" },
        { autoApplyCount: 0, autoApplyResetAt: new Date() }
      )
    ) as { modifiedCount: number };
    return { reset: result.modifiedCount };
  }
);
