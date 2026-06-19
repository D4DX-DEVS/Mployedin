import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { notify } from "@/lib/notifications/trigger";

/**
 * GET /api/cron/job-alerts
 * Sends job alert notifications to job seekers based on their preferences.
 * Runs daily — finds new jobs from last 24h and matches against preferences.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get jobs posted in the last 24 hours
  const newJobs = await Job.find({
    status: "active",
    deletedAt: null,
    createdAt: { $gte: since },
  })
    .select("title location requirements salary employmentType category tags employerId")
    .populate("employerId", "companyName")
    .lean();

  if (newJobs.length === 0) {
    return NextResponse.json({ message: "No new jobs to alert", sent: 0 });
  }

  // ── Scalable fan-out ──────────────────────────────────────────────────────
  // Process EVERY eligible seeker in _id-ordered batches (cursor pagination, no
  // skip — stays fast at any user count). The previous `.limit(5000)` silently
  // dropped alerts for everyone past the 5000th seeker once the audience grew.
  // Within each batch, notifications are dispatched with bounded concurrency so
  // a large audience never runs thousands of sequential awaits (function
  // timeout) nor an unbounded Promise.all (connection / email-provider overload).
  const SEEKER_BATCH = 1000;
  const NOTIFY_CONCURRENCY = 25;
  const TIME_BUDGET_MS = 50_000; // stay safely under maxDuration

  const matchSeekerJobs = (seeker: {
    preferredRoles?: string[];
    preferredCountries?: string[];
    skills?: string[];
    preferredJobType?: string;
  }) =>
    newJobs.filter((job) => {
      let score = 0;
      // Role match
      if (seeker.preferredRoles?.length) {
        const titleLower = job.title.toLowerCase();
        if (seeker.preferredRoles.some((role) => titleLower.includes(role.toLowerCase()))) score += 3;
      }
      // Location/country match
      if (seeker.preferredCountries?.length && job.location?.country) {
        if (seeker.preferredCountries.some((c) => c.toLowerCase() === job.location.country.toLowerCase())) score += 2;
      }
      // Skills match
      if (seeker.skills?.length && job.requirements?.skills?.length) {
        const seekerSkills = seeker.skills.map((s) => s.toLowerCase());
        const matchCount = job.requirements.skills.filter((s: string) => seekerSkills.includes(s.toLowerCase())).length;
        if (matchCount > 0) score += Math.min(matchCount, 3);
      }
      // Remote preference
      if (seeker.preferredJobType === "remote" && job.location?.isRemote) score += 1;
      return score >= 2; // minimum threshold
    });

  let sentCount = 0;
  let seekersChecked = 0;
  const errors: string[] = [];
  let lastId: unknown = null;
  let truncated = false;
  const startedAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batchFilter: Record<string, unknown> = {
      profileVisibility: "visible",
      availabilityStatus: { $ne: "not_available" },
    };
    if (lastId) batchFilter._id = { $gt: lastId };

    const seekers = await JobSeeker.find(batchFilter)
      .sort({ _id: 1 })
      .limit(SEEKER_BATCH)
      .select("userId preferredRoles preferredCountries skills preferredJobType")
      .lean();

    if (seekers.length === 0) break;
    lastId = seekers[seekers.length - 1]._id;
    seekersChecked += seekers.length;

    // Build notify tasks only for seekers with at least one matching job.
    const tasks = seekers
      .map((seeker) => ({ seeker, matched: matchSeekerJobs(seeker) }))
      .filter((x) => x.matched.length > 0)
      .map(({ seeker, matched }) => async () => {
        const topJobs = matched.slice(0, 5);
        const jobTitles = topJobs.map((j) => j.title).join(", ");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const companyNames = [...new Set(topJobs.map((j) => (j.employerId as any)?.companyName).filter(Boolean))].slice(0, 3).join(", ");
        await notify({
          userId: String(seeker.userId),
          type: "new_job_posted",
          title: `${matched.length} new job${matched.length > 1 ? "s" : ""} matching your profile`,
          message: `New openings: ${jobTitles.slice(0, 100)}${jobTitles.length > 100 ? "..." : ""} at ${companyNames}`,
          link: "/job-seeker/jobs",
          sendEmail: true,
        });
      });

    // Dispatch in concurrency-limited chunks.
    for (let i = 0; i < tasks.length; i += NOTIFY_CONCURRENCY) {
      const results = await Promise.allSettled(tasks.slice(i, i + NOTIFY_CONCURRENCY).map((t) => t()));
      for (const r of results) {
        if (r.status === "fulfilled") sentCount++;
        else if (errors.length < 10) errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
    }

    if (seekers.length < SEEKER_BATCH) break; // reached the last page
    if (Date.now() - startedAt > TIME_BUDGET_MS) { truncated = true; break; }
  }

  return NextResponse.json({
    message: "Job alerts sent",
    newJobsCount: newJobs.length,
    seekersChecked,
    alertsSent: sentCount,
    truncated: truncated || undefined,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
