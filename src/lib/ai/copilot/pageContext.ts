import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import Application from "@/models/Application";

/**
 * Parse employer job ID from a URL path.
 * Matches `/employer/jobs/<24 hex>` anywhere in the path (locale prefix `/en` or `/ar` may precede).
 * Case-insensitive. Ignores `/employer/jobs/new`.
 * Returns the id or null.
 */
export function parseEmployerJobIdFromPath(path: string | undefined): string | null {
  if (!path) return null;

  // Match /employer/jobs/<24 hex> (case-insensitive), but not /employer/jobs/new
  const match = path.match(/\/employer\/jobs\/([0-9a-f]{24})(?:\/|$)/i);
  if (!match) return null;

  return match[1];
}

/**
 * Build employer job context for the copilot.
 * Loads the employer (must be owned by userId) and the job (must not be deleted).
 * Returns null unless both are found and owned.
 */
export async function buildEmployerJobContext(
  userId: string,
  jobId: string
): Promise<{ jobId: string; title: string; applicants: number; atApplied: number } | null> {
  await connectDB();

  const employer = await Employer.findOne({ userId }).select("_id").lean();
  if (!employer) return null;

  const job = await Job.findOne({
    _id: jobId,
    employerId: employer._id,
    deletedAt: null,
  })
    .select("_id title")
    .lean();

  if (!job) return null;

  const [applicants, atApplied] = await Promise.all([
    Application.countDocuments({ jobId: job._id }),
    Application.countDocuments({ jobId: job._id, status: "applied" }),
  ]);

  return {
    jobId: String(job._id),
    title: job.title ?? "",
    applicants,
    atApplied,
  };
}
