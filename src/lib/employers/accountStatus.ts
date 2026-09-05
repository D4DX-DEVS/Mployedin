/**
 * Employer account status → job visibility.
 *
 * Deactivating an employer used to flip `User.isActive` only, so the company's
 * jobs stayed publicly listed and kept accepting applications. These helpers
 * are the single place both admin deactivation paths (bulk / single user
 * update, employer soft-delete) call so that:
 *   - `Employer.isActive` mirrors the account state (tenant view and
 *     impersonation already refuse inactive employers), and
 *   - live jobs are paused with `pauseReason: "employer_deactivated"`, which is
 *     what lets reactivation restore exactly those jobs and leave jobs the
 *     employer paused on purpose untouched.
 */
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";

export const EMPLOYER_DEACTIVATED_PAUSE_REASON = "employer_deactivated" as const;

export interface EmployerAccountStatusResult {
  /** Employer profile id, or null when the user has no employer profile. */
  employerId: string | null;
  /** Number of jobs paused (deactivate) or resumed (reactivate). */
  affectedJobs: number;
}

async function setEmployerActive(userId: string | Types.ObjectId, isActive: boolean): Promise<string | null> {
  await connectDB();
  const employer = await Employer.findOneAndUpdate(
    { userId },
    { $set: { isActive } },
    { returnDocument: "after" },
  )
    .select("_id")
    .lean<{ _id: Types.ObjectId } | null>();
  return employer ? String(employer._id) : null;
}

/** Mark the employer inactive and take their live jobs off the market. */
export async function deactivateEmployerAccount(
  userId: string | Types.ObjectId,
): Promise<EmployerAccountStatusResult> {
  const employerId = await setEmployerActive(userId, false);
  if (!employerId) return { employerId: null, affectedJobs: 0 };

  const result = await Job.updateMany(
    { employerId, status: "active", deletedAt: null },
    { $set: { status: "paused", pauseReason: EMPLOYER_DEACTIVATED_PAUSE_REASON } },
  );
  return { employerId, affectedJobs: result.modifiedCount ?? 0 };
}

/** Mark the employer active again and resume only the jobs paused by deactivation. */
export async function reactivateEmployerAccount(
  userId: string | Types.ObjectId,
): Promise<EmployerAccountStatusResult> {
  const employerId = await setEmployerActive(userId, true);
  if (!employerId) return { employerId: null, affectedJobs: 0 };

  const result = await Job.updateMany(
    { employerId, status: "paused", pauseReason: EMPLOYER_DEACTIVATED_PAUSE_REASON },
    { $set: { status: "active" }, $unset: { pauseReason: 1 } },
  );
  return { employerId, affectedJobs: result.modifiedCount ?? 0 };
}
