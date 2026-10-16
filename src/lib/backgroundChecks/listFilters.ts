import mongoose from "mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";

/**
 * Filters for the staff background-check list (GET /api/background-checks).
 * An agent can work with many employers, so the list narrows by employer,
 * job, check type, who holds the check and a free-text search — all of it
 * on top of the caller's scope, never instead of it.
 */

export const LIST_STATUSES = ["pending", "in_progress", "completed", "cancelled", "open", "awaiting_reply"] as const;
export const LIST_TYPES = ["background", "reference", "both"] as const;
export const LIST_HOLDERS = ["me", "unassigned", "others"] as const;

const OBJECT_ID = /^[a-f0-9]{24}$/i;
/** How many matches per collection a search may pull in; a search wider than this should be narrowed. */
const SEARCH_CAP = 200;

/** Status filter clauses. "open" = not finished; "awaiting_reply" = running, has referees, none has replied. */
export function statusClause(status: string | null): Record<string, unknown> | null {
  switch (status) {
    case "pending":
    case "in_progress":
    case "completed":
    case "cancelled":
      return { status };
    case "open":
      return { status: { $in: ["pending", "in_progress"] } };
    case "awaiting_reply":
      return awaitingReplyClause();
    default:
      return null;
  }
}

export function awaitingReplyClause(): Record<string, unknown> {
  // `$ne` on an array path matches only when NO element has that status.
  return { status: "in_progress", "references.0": { $exists: true }, "references.status": { $ne: "responded" } };
}

export function holderClause(holder: string | null, userId: string): Record<string, unknown> | null {
  if (!OBJECT_ID.test(userId)) return null;
  const me = new mongoose.Types.ObjectId(userId);
  if (holder === "me") return { assignedTo: me };
  if (holder === "unassigned") return { assignedTo: null };
  if (holder === "others") return { assignedTo: { $nin: [null, me] } };
  return null;
}

/** Checks whose candidate, employer or job matches `q`. Null when `q` is blank. */
async function searchClause(q: string): Promise<Record<string, unknown> | null> {
  const text = q.trim().slice(0, 100);
  if (!text) return null;
  const pattern = { $regex: escapeRegex(text), $options: "i" };

  const [employers, jobs, seekersByName, users] = await Promise.all([
    Employer.find({ companyName: pattern }).select("_id").limit(SEARCH_CAP).lean(),
    Job.find({ title: pattern }).select("_id").limit(SEARCH_CAP).lean(),
    JobSeeker.find({ fullName: pattern }).select("_id").limit(SEARCH_CAP).lean(),
    User.find({ name: pattern, role: "job_seeker" }).select("_id").limit(SEARCH_CAP).lean(),
  ]);
  const seekersByUser = users.length
    ? await JobSeeker.find({ userId: { $in: users.map((u) => u._id) } }).select("_id").limit(SEARCH_CAP).lean()
    : [];

  const ids = (rows: Array<{ _id: unknown }>) => rows.map((r) => r._id);
  return {
    $or: [
      { employerId: { $in: ids(employers) } },
      { jobId: { $in: ids(jobs) } },
      { jobSeekerId: { $in: [...ids(seekersByName), ...ids(seekersByUser)] } },
    ],
  };
}

/**
 * The full Mongo filter: the caller's scope AND every filter set in `params`.
 * Plain fields (status, type, holder) merge onto the scope; employer, job and
 * search go into `$and`, because the scope itself may already constrain
 * `employerId`/`jobId` or use `$or`, and a filter must never widen it.
 */
export async function buildStaffListFilter(
  scope: Record<string, unknown> | "all",
  params: URLSearchParams,
  userId: string,
): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = scope === "all" ? {} : { ...scope };

  const status = statusClause(params.get("status"));
  if (status) Object.assign(filter, status);

  const type = params.get("checkType");
  if (type && (LIST_TYPES as readonly string[]).includes(type)) filter.checkType = type;

  const holder = holderClause(params.get("holder"), userId);
  if (holder) Object.assign(filter, holder);

  const and: Record<string, unknown>[] = [];
  const employerId = params.get("employerId");
  if (employerId && OBJECT_ID.test(employerId)) and.push({ employerId: new mongoose.Types.ObjectId(employerId) });
  const jobId = params.get("jobId");
  if (jobId && OBJECT_ID.test(jobId)) and.push({ jobId: new mongoose.Types.ObjectId(jobId) });
  const search = await searchClause(params.get("q") ?? "");
  if (search) and.push(search);
  if (and.length > 0) filter.$and = and;

  return filter;
}
