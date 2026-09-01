import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { notify } from "@/lib/notifications/trigger";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import logger from "@/lib/logger";
import { forEachBounded, byId } from "@/lib/cron/scale";

export const maxDuration = 300;

const defaultLocale = "en";

// Called by cron scheduler (e.g. Vercel Cron)
// Closes all active jobs whose expiresAt has passed

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();

  const expiredJobs = await Job.find({
    status: "active",
    expiresAt: { $lte: now },
  })
    .select("_id title employerId")
    .limit(500)
    .lean();
  // Next scheduled run will process any remainder.

  // Jobs auto-closed by max applicant limit.
  // $ifNull guards legacy docs missing applicantIds — $size throws on
  // non-arrays even while the planner is only sampling documents.
  const fullJobs = await Job.find({
    status: "active",
    maxApplicants: { $exists: true, $gt: 0 },
    $expr: { $gte: [{ $size: { $ifNull: ["$applicantIds", []] } }, "$maxApplicants"] },
  })
    .select("_id title employerId")
    .limit(500)
    .lean();
  // Next scheduled run will process any remainder.

  // Merge, dedup by id
  const allIds = new Set<string>();
  const allJobs = [...expiredJobs, ...fullJobs].filter((j) => {
    const id = String(j._id);
    if (allIds.has(id)) return false;
    allIds.add(id);
    return true;
  });

  if (!allJobs.length) {
    return NextResponse.json({ success: true, closed: 0, timestamp: now.toISOString() });
  }

  const jobIds = allJobs.map((j) => j._id);
  await Job.updateMany({ _id: { $in: jobIds } }, { $set: { status: "closed" } });

  // Batch-fetch employers and users
  const employerIds = allJobs.map((j) => j.employerId).filter(Boolean);
  const employers = await Employer.find({ _id: { $in: employerIds } }).select("_id userId").lean();
  const employerMap = byId(employers);

  const userIds = employers.map((e) => e.userId).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }).select("_id").lean();
  const userMap = byId(users);

  // Notify each employer with bounded concurrency
  const { failed } = await forEachBounded(allJobs, 10, async (job) => {
    const employer = employerMap.get(String(job.employerId));
    if (!employer) {
      logger.warn({ jobId: String(job._id), employerId: String(job.employerId) }, "Employer not found for job");
      return;
    }

    const user = userMap.get(String(employer.userId));
    if (!user) {
      logger.warn({ jobId: String(job._id), employerId: String(job.employerId), userId: String(employer.userId) }, "User not found for employer");
      return;
    }

    await notify({
      userId: String(user._id),
      type: "system",
      title: "Job listing expired",
      message: `Your job posting "${job.title}" has expired and been closed automatically. Repost it to receive new applications.`,
      link: `/${defaultLocale}/employer/jobs`,
    });
  });

  return NextResponse.json({
    success: true,
    closed: allJobs.length,
    errors: failed,
    timestamp: now.toISOString(),
  });
}
