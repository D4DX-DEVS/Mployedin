/**
 * Job Recommendations — Inngest Cron Function
 *
 * The cron fires every morning at 9 AM UTC, but that is the *check* interval,
 * not the send interval. Each seeker has a cadence — weekly by default, daily
 * if they ask for it — and the gate holds them until it has elapsed. A weekly
 * seeker is therefore released on the first morning after seven days that
 * actually has something worth sending, rather than being pinned to a fixed
 * weekday that may have nothing on it.
 *
 * That is one step better than the boards we benchmarked (Indeed, Naukri,
 * Bayt, LinkedIn all offer daily-or-weekly, and LinkedIn's weekly digest is a
 * fixed Tuesday 10:00 slot). Weekly is our default because the board carries
 * ~62 active jobs against a relevance floor of 80: a daily send has something
 * to say to roughly ten people and nothing for the other two hundred.
 *
 * Per seeker:
 *   1. Resolve the digest gate (see digestGate.ts) — cadence, plus each half
 *      of the digest switched on or off on its own, so "Job Match Alerts: off"
 *      silences the job section without also hiding who viewed the profile
 *   2. Skip the job half entirely when the profile states fewer than
 *      MIN_PROFILE_SIGNALS things — its percentages would be neutral defaults
 *   3. Rank eligible jobs through the shared pipeline (lib/matching)
 *   4. Keep the top 5 clearing SystemConfig.matching.minScore
 *   5. Aggregate profile views since the last digest
 *   6. Raise the in-app "new jobs matching you" bell entry
 *   7. Emit "notification/daily-digest" event with combined data
 *
 * This is the platform's ONLY "new jobs for you" push. A second daily cron
 * (/api/cron/job-alerts, 07:00 UTC) used to send its own, weaker version of the
 * same email two hours earlier; it was deleted rather than kept in sync. Saved
 * *searches* are separate and still run hourly — the seeker asked for that
 * exact query, which is the distinction every major board draws too.
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
  seekerProfileFromDoc,
  profileSignalCount,
  MIN_PROFILE_SIGNALS,
  SEEKER_MATCH_FIELDS,
} from "@/lib/matchScore";
import {
  recommendJobsFor,
  toCandidateJob,
  JOB_MATCH_FIELDS,
  type CandidateJob,
} from "@/lib/matching/recommend";
import { prepareSkillVectors } from "@/lib/matching/skillVectors";
import { MAX_RECOMMENDATIONS } from "@/lib/matching/constants";
import { markRecommended, alreadyRecommendedJobIds } from "@/lib/matching/recommendationLog";
import { isUndeliverableAddress } from "@/lib/communications/email";
import {
  profileCompletenessScore,
  PROFILE_COMPLETENESS_FIELDS,
} from "@/lib/jobSeeker/profileCompleteness";
import {
  isCronEnabled,
  updateCronRunStatus,
  resolveMatchThreshold,
  isAiRerankEnabled,
  resolveDefaultDigestCadence,
} from "@/models/SystemConfig";
import { RECOMMENDATION_COOLDOWN_DAYS } from "@/lib/matching/constants";
import { digestGateFor, isWithinDigestCooldown, type DigestGate } from "@/lib/notifications/digestGate";
import { notify } from "@/lib/notifications/trigger";

const BATCH_SIZE = 50;
const TOP_JOBS_COUNT = MAX_RECOMMENDATIONS;

/**
 * How long to wait before telling a seeker again that nothing cleared the bar.
 *
 * Deliberately longer than the weekly digest cadence. A weekly seeker who
 * clears nothing would otherwise receive a "we found you nothing" note every
 * single cycle, which is the same nagging the cadence change set out to stop.
 * Once a fortnight keeps it honest without making emptiness the routine.
 */
const NEAR_MISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

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
    // How often a seeker with no saved preference hears from us. Admin-set;
    // weekly by default. The cron still runs every morning — a weekly seeker
    // is simply held by a seven-day cooldown and released on the first day
    // after it that has something worth sending, rather than being pinned to
    // a fixed weekday that may have nothing.
    const platformDefault = await step.run("resolve-default-cadence", () =>
      resolveDefaultDigestCadence(),
    );

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

      // Stated availability is the fallback cadence signal when the seeker
      // never touched their notification settings — which is all of them, the
      // preference documents being created lazily. Only an answer counts:
      // `availabilityStatus` defaults to "immediately" at signup, so the
      // timestamp is what separates intent from the default.
      const availabilities = await JobSeeker.find({ userId: { $in: userIds } })
        .select("userId availabilityStatus availabilityStatusSetAt")
        .lean();
      const availByUser = new Map(
        availabilities.map((a) => [
          String((a as { userId: unknown }).userId),
          {
            status: (a as { availabilityStatus?: string }).availabilityStatus,
            setAt: (a as { availabilityStatusSetAt?: Date }).availabilityStatusSetAt,
          },
        ]),
      );

      const prefByUser = new Map(prefs.map((p) => [p.userId.toString(), p]));
      const now = new Date();

      return userIds
        .map((userId) => ({
          userId,
          gate: digestGateFor(prefByUser.get(userId), {
            now,
            platformDefault,
            availability: availByUser.get(userId),
          }),
        }))
        .filter((entry) => entry.gate.send);
    });

    if (gates.length === 0) {
      return { processed: 0, reason: "no eligible seekers" };
    }

    // The relevance floor and the AI switch are admin-controlled, and every
    // surface must use the same values — they were hard-coded three different
    // ways before (50 here, 40 in the weekly digest and the re-engagement
    // mail, none in similar-jobs).
    const threshold = await step.run("resolve-threshold", () => resolveMatchThreshold());
    const useAi = await step.run("resolve-ai-rerank", () => isAiRerankEnabled());

    // Fetch active jobs once (shared across all batches). The projection must
    // cover every field jobProfileFromDoc reads — `workMode` was missing, so
    // the seeker's remote/onsite preference was collected and never enforced.
    const activeJobs: CandidateJob[] = await step.run("fetch-active-jobs", async () => {
      const now = new Date();
      const jobs = await Job.find({
        status: "active",
        $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
      })
        .select(JOB_MATCH_FIELDS)
        .populate("employerId", "companyName")
        .limit(500)
        .lean();

      return jobs.map((j) => toCandidateJob(j as unknown as Record<string, unknown>));
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

          // One query for the whole batch instead of one per seeker.
          // Both projections: the match fields feed scoring, the completeness
          // fields feed the "improve your matches" block. A field missing from
          // a projection scores as absent rather than erroring, so neither
          // list may be dropped.
          const seekerDocs = await JobSeeker.find({
            userId: { $in: batch.map((b) => b.userId) },
          })
            .select(`userId ${SEEKER_MATCH_FIELDS} ${PROFILE_COMPLETENESS_FIELDS}`)
            .lean();
          const seekerByUser = new Map(
            seekerDocs.map((d) => [String((d as { userId: unknown }).userId), d]),
          );

          // Skill vectors are loaded here rather than in a step of their own:
          // 800-odd 3072-float vectors would be serialised into Inngest's step
          // state on every resume. Loading them inside the step keeps them in
          // memory, and the Mongo cache means only the first batch of the
          // first ever run pays for embedding.
          const skillVectors = await prepareSkillVectors(
            activeJobs,
            seekerDocs.map((d) => seekerProfileFromDoc(d as never)),
          );

          for (const { userId, gate } of batch) {
            try {
              const seeker = seekerByUser.get(userId);
              if (!seeker) continue;

              const seekerProfile = seekerProfileFromDoc(seeker as never);
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
              // job match alerts off, and when the profile states too little
              // for a match percentage to mean anything. Those seekers are
              // already covered by the profile-completion reminder, so the
              // honest move is to send them nothing here rather than five
              // cards built out of neutral defaults.
              const hasProfileSignal =
                profileSignalCount(seekerProfile) >= MIN_PROFILE_SIGNALS;

              // Jobs already mailed inside the cooldown window. Without this
              // the same top five went out every morning until the seeker
              // applied — and the stricter the relevance floor, the more
              // stable that winning set becomes.
              const recentlySent = !gate.jobs || !hasProfileSignal
                ? new Set<string>()
                : await alreadyRecommendedJobIds(userId);

              const candidates =
                !gate.jobs || !hasProfileSignal
                  ? []
                  : activeJobs.filter(
                      (j) => !appliedJobIds.has(j.id) && !recentlySent.has(j.id),
                    );

              const recommendation = await recommendJobsFor(seekerProfile, candidates, {
                threshold,
                limit: TOP_JOBS_COUNT,
                useAi,
                vectors: skillVectors,
              });
              const scoredJobs = recommendation.jobs;

              // A high floor means most seekers clear nothing, most days. That
              // is the intended behaviour — but going permanently silent is
              // not, so the digest carries an honest "nothing strong enough
              // today, here is what would change that" section instead.
              //
              // `limitingFactor` names the real cause rather than the biggest
              // gate. A seeker who has never listed a skill has a ceiling of
              // 40% and was being told "most openings are outside your
              // countries" — true of the jobs that were dropped, useless as
              // advice, and it blames the job board for an empty profile.
              const nearMiss =
                gate.jobs && hasProfileSignal && scoredJobs.length === 0
                  ? {
                      bestScore: recommendation.bestScore,
                      threshold: recommendation.threshold,
                      considered: recommendation.considered,
                      /** What is actually holding them back. See diagnoseLimitingFactor. */
                      topBlocker: recommendation.limitingFactor ?? null,
                    }
                  : null;

              // Atomic claim, same pattern as the digest cooldown below:
              // whoever flips the timestamp sends, everyone else backs off.
              let sendNearMiss = false;
              if (nearMiss) {
                const nearMissCutoff = new Date(Date.now() - NEAR_MISS_COOLDOWN_MS);
                const claimed = await NotificationPreference.findOneAndUpdate(
                  {
                    userId,
                    $or: [
                      { lastNearMissSentAt: { $exists: false } },
                      { lastNearMissSentAt: { $lte: nearMissCutoff } },
                    ],
                  },
                  { $set: { lastNearMissSentAt: new Date() } },
                  { new: true, projection: { _id: 1 } },
                ).lean();
                sendNearMiss = claimed !== null;
              }

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

              // Skip if nothing to send. The near-miss note counts as
              // something: it is the only thing standing between a strict
              // threshold and indefinite silence.
              if (scoredJobs.length === 0 && profileViews.count === 0 && !sendNearMiss) {
                continue;
              }

              // Fetch user details for email
              const user = await User.findById(userId)
                .select("name email locale")
                .lean();
              if (!user?.email) continue;
              // Seed/QA accounts sit on reserved domains that sendEmail refuses
              // by throwing. Emitting for them anyway meant the digest worker
              // failed, Inngest retried it, and — because the failure skipped
              // the step that stamps lastDigestSentAt — the 23-hour gate never
              // closed either. 116 of today's 310 digest rows were that loop.
              if (isUndeliverableAddress(user.email)) continue;

              // Claim today's digest for this seeker before emitting anything.
              //
              // The 23-hour gate used to be *read* here and *written* by the
              // digest worker after a successful send, so any failure left it
              // open: the worker retried, this batch step retried, and each
              // attempt sent again. Across the 10–16 September SMTP outage that
              // produced 872 delivery attempts a day for ~224 seekers — four
              // per person, all failing, deepening the Gmail login throttle
              // that caused the outage. (No seeker was ever *delivered* two
              // digests in a day; the duplicates were all failed retries.)
              //
              // One atomic findOneAndUpdate is the claim: whoever flips the
              // timestamp wins, everyone else sees a fresh pre-image and backs
              // off. Upsert covers seekers with no preference document yet.
              const claimedAt = new Date();
              const before = await NotificationPreference.findOneAndUpdate(
                { userId },
                { $set: { lastDigestSentAt: claimedAt } },
                { upsert: true, returnDocument: "before", projection: { lastDigestSentAt: 1 } },
              ).lean<{ lastDigestSentAt?: Date } | null>();
              // Claim with the seeker's own cadence, or a weekly seeker released
              // today would be re-released tomorrow by a 23-hour check.
              if (isWithinDigestCooldown(before?.lastDigestSentAt, claimedAt, gate.cadence)) continue;

              // Emit digest event
              await inngest.send({
                name: "notification/daily-digest",
                data: {
                  userId,
                  userName: user.name,
                  email: user.email,
                  locale: user.locale ?? "en",
                  jobs: scoredJobs.map((j) => ({
                    jobId: j.id,
                    title: j.title,
                    company: j.company,
                    location: j.location,
                    matchScore: j.score,
                    salary: j.salary,
                    // The skills that earned the score. A percentage with no
                    // reasoning behind it is the thing seekers distrust most.
                    matchedSkills: j.breakdown.matchedSkills.slice(0, 5),
                  })),
                  profileViews,
                  profile: {
                    completeness: profileCompletenessScore(seeker),
                    signals: profileSignalCount(seekerProfile),
                  },
                  // Present only when nothing cleared the bar. Lets the email
                  // say "your closest match today was 71%, we only send 80%+"
                  // rather than quietly sending nothing.
                  ...(sendNearMiss && nearMiss ? { nearMiss } : {}),
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

              // Remember what went out, so tomorrow's run picks different
              // jobs instead of re-sending today's.
              if (scoredJobs.length > 0) {
                await markRecommended(
                  userId,
                  scoredJobs.map((j) => ({ id: j.id, score: j.score })),
                  "daily_digest",
                  RECOMMENDATION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
                );
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
