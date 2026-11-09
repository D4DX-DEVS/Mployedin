/**
 * Ties a staff member's AI call to the employer it was made for.
 *
 * The AI routes know who is calling (the auth wrapper records that) but not which
 * client the work is for. When a request names the employer, or a saved job, this
 * checks the staff member may act for that employer and tags the call, so the admin
 * AI usage page can split "for employers" from "own work". A claim the caller may
 * not make is ignored, never trusted: spend is not attributed to someone else's client.
 */
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { tagAiEmployer } from "./usageContext";

const STAFF = new Set(["admin", "agent", "super_agent"]);

export async function attributeStaffAiToEmployer(
  ctx: { userId: string; role: string },
  target: { employerId?: string; jobId?: string },
): Promise<string | null> {
  if (!STAFF.has(ctx.role)) return null;
  try {
    await connectDB();
    let employerId = target.employerId ?? null;
    if (!employerId && target.jobId) {
      const job = await Job.findById(target.jobId).select("employerId").lean<{ employerId?: mongoose.Types.ObjectId } | null>();
      employerId = job?.employerId ? String(job.employerId) : null;
    }
    if (!employerId || !mongoose.isValidObjectId(employerId)) return null;
    const scope = await getScopedEmployerIds(ctx);
    // null = unrestricted (admin); otherwise the employer must be in the staff member's book.
    if (scope !== null && !scope.some((id) => String(id) === employerId)) return null;
    tagAiEmployer(employerId);
    return employerId;
  } catch {
    // Attribution is best effort and must never block the AI answer.
    return null;
  }
}
