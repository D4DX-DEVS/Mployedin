import { cache } from "react";
import Job from "@/models/Job";
import User from "@/models/User";
import { JOBS_WITHOUT_APPLICATIONS_MATCH } from "@/lib/admin/platformAlerts";
import type { UserRoleBucket } from "./types";

/**
 * Figures more than one dashboard section needs, memoised for one request
 * with React `cache` so the sections — which stream independently — share one
 * query instead of each running its own, and cannot disagree about a number.
 */

/** "Active job" everywhere on the dashboard: live and not soft-deleted. */
export const ACTIVE_JOB_FILTER = { status: "active", deletedAt: null } as const;

// `.exec()`: `cache` hands every caller the same value, and awaiting one
// Mongoose Query twice throws "Query was already executed". A promise can be
// awaited by any number of sections.
export const countActiveJobs = cache((): Promise<number> => Job.countDocuments(ACTIVE_JOB_FILTER).exec());

const ROLE_BUCKETS: readonly UserRoleBucket[] = ["job_seeker", "employer", "agent", "super_agent"];

/** Accounts per role; admins and any legacy role fall into "other" so the split adds up to the total. */
export const getUserRoleCounts = cache(async (): Promise<{ role: UserRoleBucket; count: number }[]> => {
  const rows = await User.aggregate<{ _id: string | null; count: number }>([{ $group: { _id: "$role", count: { $sum: 1 } } }]);
  const byRole = new Map(rows.map((row) => [row._id ?? "", row.count]));
  const named = ROLE_BUCKETS.map((role) => ({ role, count: byRole.get(role) ?? 0 }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const other = total - named.reduce((sum, row) => sum + row.count, 0);
  return [...named, { role: "other", count: Math.max(0, other) }];
});

/**
 * Active jobs by application volume: none, and one or two ("low volume").
 * The action queue's "jobs with no applications" and the Job health card's
 * "low volume" come from this one aggregate.
 */
export const getJobDemandBuckets = cache(async (): Promise<{ none: number; low: number }> => {
  const rows = await Job.aggregate<{ _id: number; count: number }>([
    { $match: { ...JOBS_WITHOUT_APPLICATIONS_MATCH } },
    {
      $lookup: {
        from: "applications",
        let: { jobId: "$_id" },
        // Three is enough to tell 0, 1–2 and "3 or more" apart.
        pipeline: [{ $match: { $expr: { $eq: ["$jobId", "$$jobId"] } } }, { $limit: 3 }],
        as: "applications",
      },
    },
    { $group: { _id: { $size: "$applications" }, count: { $sum: 1 } } },
  ]);
  const count = (size: number) => rows.find((row) => row._id === size)?.count ?? 0;
  return { none: count(0), low: count(1) + count(2) };
});
