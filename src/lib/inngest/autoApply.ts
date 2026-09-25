import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import Application from "@/models/Application";
import { ActivityEvent, ACTIVITY_PRIORITY } from "@/models/ActivityEvent";
import Employer from "@/models/Employer";
import { SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { computeBehaviorSignals } from "@/lib/behaviorSignals";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import { buildRecommendedJobQuery } from "@/lib/jobRecommendations";
import { JOB_MATCH_FIELDS } from "@/lib/matching/constants";
import { recommendJobsFor, toCandidateJob } from "@/lib/matching/recommend";
import { resolveEngineOptions, storedBreakdown, type StoredMatchBreakdown } from "@/lib/matching/seekerMatches";
import { prepareSkillVectors } from "@/lib/matching/skillVectors";

const AUTO_APPLY_DAILY_LIMIT = 5;

/** How many of the newest candidate jobs are scored per run. */
const AUTO_APPLY_POOL_SIZE = 100;

/**
 * Inngest v4 function: auto-apply to matching jobs for a job seeker.
 * Triggers: event "job-seeker/auto-apply.triggered" or "job-seeker/auto-apply.cron"
 *
 * Applies only to jobs the engine would recommend — eligible on every hard
 * gate and at or above the admin threshold — which is a stricter bar than
 * anything else here, because this one acts in the seeker's name. It used to
 * apply on the older scorer at 60 with no gates, and its country filter
 * overwrote the expiry filter, so expired jobs and jobs in countries the
 * seeker never chose were both fair game.
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

    await connectDB();

    const seeker = await step.run("fetch-seeker", () =>
      JobSeeker.findOne({ userId })
        .select(`_id userId applicationMode autoApplyCount autoApplyResetAt profileCompleteness updatedAt isAgentReferred ${SEEKER_MATCH_FIELDS}`)
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

    // Withdrawn applications count here, unlike on the recommendation pages:
    // a seeker who withdrew must not be re-applied for automatically.
    const appliedJobIds = await step.run("fetch-applied-ids", () =>
      Application.find({ jobSeekerId: seeker._id })
        .select("jobId")
        .lean()
        .then((apps) => apps.map((a) => a.jobId))
    );

    // The recommendation pages' retrieval: live, unexpired, not applied to,
    // and in a preferred country (any spelling) or remote. The engine's gates
    // then decide, remote jobs included.
    const candidateJobs = await step.run("fetch-jobs", () =>
      Job.find(
        buildRecommendedJobQuery({
          preferredCountries: seeker.preferredCountries,
          excludeJobIds: appliedJobIds,
          now,
        }),
      )
        .sort({ createdAt: -1, _id: -1 })
        .limit(AUTO_APPLY_POOL_SIZE)
        .select(JOB_MATCH_FIELDS)
        .lean()
    ) as Array<Record<string, unknown>>;

    // In a step, so the replay Inngest runs before each apply step reads the
    // stored picks instead of scoring the pool again.
    const picks = (await step.run("score-jobs", async () => {
      const [profile, engine] = await Promise.all([
        effectiveSeekerProfile(String(seeker.userId), seeker),
        resolveEngineOptions(),
      ]);
      const candidates = candidateJobs.map((job) => toCandidateJob(job));
      const vectors = await prepareSkillVectors(candidates, [profile]);
      const result = await recommendJobsFor(profile, candidates, { ...engine, vectors, limit: remaining });
      const byId = new Map(candidateJobs.map((job) => [String(job._id), job]));
      return result.jobs.map((match) => ({
        job: byId.get(match.id) as Record<string, unknown>,
        score: match.score,
        breakdown: storedBreakdown(match),
      }));
    })) as Array<{ job: Record<string, unknown>; score: number; breakdown: StoredMatchBreakdown }>;

    if (picks.length === 0) return { skipped: "no eligible jobs" };

    let applied = 0;
    for (const { job, score, breakdown } of picks) {
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
          isAgentReferred: (seeker as { isAgentReferred?: boolean }).isAgentReferred === true,
          aiMatchScore: score,
          seekerMatchScore: score,
          scoredVia: "engine",
          matchBreakdown: breakdown,
          appliedAt: now,
          statusHistory: [{ status: "applied", changedAt: now }],
          behaviorSignals: bSignals,
          behaviorScore: bScore,
        });

        await JobSeeker.updateOne({ _id: seeker._id }, { $inc: { autoApplyCount: 1 } });

        // The score above is the seeker's; the employer's checklist, skills
        // lists and (weighted) ranking come from the screening worker, the
        // same as for every other application.
        await inngest.send({ name: "application/ai-screen", data: { applicationId: String(application._id) } });

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
    await connectDB();
    const result = await step.run("reset-counts", () =>
      JobSeeker.updateMany(
        { applicationMode: "auto" },
        { autoApplyCount: 0, autoApplyResetAt: new Date() }
      )
    ) as { modifiedCount: number };
    return { reset: result.modifiedCount };
  }
);
