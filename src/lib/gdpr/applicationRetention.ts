/**
 * Application retention (owner decision 2026-10-28): an application is kept
 * for 24 months after its job closes, then anonymised. What the candidate
 * wrote and what the team wrote about them goes (ERASED_APPLICATION_FIELDS,
 * the same list an account erasure clears), with the documents attached to the
 * application, their diversity answers and any background check. The row
 * itself stays, linked to the profile, so placements, commission and the
 * hiring counts still add up.
 *
 * Job has no "closed at" date, so the clock starts from the job's last change
 * while closed, expired or deleted, and from the application's own last
 * change — whichever is later. That only ever keeps an application longer
 * than 24 months, never shorter.
 *
 * Inactive accounts are never deleted automatically (owner decision 2026-10-28).
 */
import type { Types } from "mongoose";
import Application from "@/models/Application";
import Job from "@/models/Job";
import DiversityResponse from "@/models/DiversityResponse";
import BackgroundCheck from "@/models/BackgroundCheck";
import { ERASED_APPLICATION_FIELDS } from "@/lib/gdpr/erasure";

export const APPLICATION_RETENTION_MONTHS = 24;
/** Applications anonymised per run; the daily cron works through any backlog. */
export const RETENTION_BATCH = 500;

/** The moment 24 months before `now`: anything last changed before it is past retention. */
export function retentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - APPLICATION_RETENTION_MONTHS);
  return cutoff;
}

export interface RetentionRunResult {
  anonymised: number;
  diversityDeleted: number;
  checksDeleted: number;
}

export async function anonymiseExpiredApplications(now: Date = new Date(), batch: number = RETENTION_BATCH): Promise<RetentionRunResult> {
  const cutoff = retentionCutoff(now);

  // Jobs that closed (or were deleted) and have not changed since before the cutoff.
  const closedJobIds = (await Job.distinct("_id", {
    $or: [{ status: { $in: ["closed", "expired"] } }, { deletedAt: { $ne: null } }],
    updatedAt: { $lte: cutoff },
  })) as Types.ObjectId[];
  if (closedJobIds.length === 0) return { anonymised: 0, diversityDeleted: 0, checksDeleted: 0 };

  const due = (await Application.find({
    jobId: { $in: closedJobIds },
    updatedAt: { $lte: cutoff },
    retentionAnonymisedAt: { $exists: false },
  })
    .select("_id")
    .limit(batch)
    .lean()) as Array<{ _id: Types.ObjectId }>;
  if (due.length === 0) return { anonymised: 0, diversityDeleted: 0, checksDeleted: 0 };
  const ids = due.map((a) => a._id);

  const [updated, diversity, checks] = await Promise.all([
    Application.updateMany(
      { _id: { $in: ids } },
      {
        $set: { retentionAnonymisedAt: now },
        $unset: Object.fromEntries([...ERASED_APPLICATION_FIELDS, "documents"].map((field) => [field, 1])),
      },
    ),
    DiversityResponse.deleteMany({ applicationId: { $in: ids } }),
    BackgroundCheck.deleteMany({ applicationId: { $in: ids } }),
  ]);

  return {
    anonymised: updated.modifiedCount,
    diversityDeleted: diversity.deletedCount ?? 0,
    checksDeleted: checks.deletedCount ?? 0,
  };
}
