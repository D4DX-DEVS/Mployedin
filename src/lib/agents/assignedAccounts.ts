import type { Model } from "mongoose";
import Employer from "@/models/Employer";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Placement from "@/models/Placement";
import { NO_ACTIVITY, type AccountActivity } from "@/lib/agents/accountActivity";

export { NO_ACTIVITY, type AccountActivity };

/** "New applicants" on the accounts card: applications from the last week. */
export const NEW_APPLICANT_DAYS = 7;
// "rescheduled" marks the superseded slot; its replacement is scheduled again.
const UPCOMING_INTERVIEW_STATUSES = ["scheduled", "confirmed"];

export interface AssignedAccount extends AccountActivity {
  /** Employer profile id — what `/agent/jobs?employerId=` filters by. */
  employerId: string;
  companyName: string;
  /** False when the employer's login is deactivated — still assigned, so still listed. */
  isActive: boolean;
}

export interface AssignedAccounts {
  /** Every assigned account, not just the rows returned. */
  total: number;
  /** Assigned accounts whose login is active — the dashboard's "Active employers". */
  active: number;
  rows: AssignedAccount[];
}

async function countByEmployer(
  model: Pick<Model<unknown>, "aggregate">,
  match: Record<string, unknown>,
): Promise<Map<string, number>> {
  const groups = await model.aggregate<{ _id: unknown; count: number }>([
    { $match: match },
    { $group: { _id: "$employerId", count: { $sum: 1 } } },
  ]);
  return new Map(groups.map((g) => [String(g._id), g.count]));
}

/**
 * Open jobs, the week's new applicants, upcoming interviews and hires for
 * each employer profile id given — four grouped reads whatever the count.
 * Employers with none of them are absent from the map.
 */
export async function countAccountActivity(
  employerIds: unknown[],
  now: Date = new Date(),
): Promise<Map<string, AccountActivity>> {
  if (employerIds.length === 0) return new Map();
  const inAccounts = { employerId: { $in: employerIds } };
  const since = new Date(now.getTime() - NEW_APPLICANT_DAYS * 24 * 60 * 60 * 1000);
  const [openJobs, newApplicants, upcomingInterviews, hires] = await Promise.all([
    countByEmployer(Job, { ...inAccounts, status: "active", deletedAt: null }),
    countByEmployer(Application, { ...inAccounts, createdAt: { $gte: since } }),
    countByEmployer(Interview, { ...inAccounts, scheduledAt: { $gte: now }, status: { $in: UPCOMING_INTERVIEW_STATUSES } }),
    // Placements, as the dashboard pipeline's "Hired" counts them.
    countByEmployer(Placement, inAccounts),
  ]);
  const activity = new Map<string, AccountActivity>();
  for (const [field, counts] of [
    ["openJobs", openJobs],
    ["newApplicants", newApplicants],
    ["upcomingInterviews", upcomingInterviews],
    ["hires", hires],
  ] as const) {
    for (const [key, count] of counts) {
      activity.set(key, { ...(activity.get(key) ?? NO_ACTIVITY), [field]: count });
    }
  }
  return activity;
}

/**
 * The accounts an admin assigned to this agent (`Agent.assignedEmployerIds` —
 * the same set the employers list flags `assignedToMe` and the tenant switch
 * lets them enter), each with its open jobs, the week's new applicants,
 * upcoming interviews and hires. Employers seen only through the agent's
 * region are left out, and so are archived profiles — the same set as the
 * employers list's "Assigned to me" view, so the dashboard count equals the
 * list it opens. A deactivated login stays listed, flagged. Busiest first:
 * new applicants, then open jobs, then A–Z.
 */
export async function loadAssignedAccounts(
  assignedEmployerIds: unknown[],
  now: Date = new Date(),
  limit = 5,
): Promise<AssignedAccounts> {
  if (assignedEmployerIds.length === 0) return { total: 0, active: 0, rows: [] };

  const profiles = await Employer.find({ _id: { $in: assignedEmployerIds }, roleArchivedAt: null })
    .select("_id companyName userId")
    .lean<{ _id: unknown; companyName?: string; userId?: unknown }[]>();
  if (profiles.length === 0) return { total: 0, active: 0, rows: [] };
  const activeUsers = await User.find({ _id: { $in: profiles.map((p) => p.userId).filter(Boolean) }, isActive: true })
    .select("_id")
    .lean<{ _id: unknown }[]>();
  const activeUserIds = new Set(activeUsers.map((u) => String(u._id)));

  const activity = await countAccountActivity(profiles.map((p) => p._id), now);
  const rows = profiles
    .map((p) => ({
      employerId: String(p._id),
      companyName: p.companyName ?? "—",
      isActive: activeUserIds.has(String(p.userId)),
      ...(activity.get(String(p._id)) ?? NO_ACTIVITY),
    }))
    .sort((a, b) =>
      b.newApplicants - a.newApplicants || b.openJobs - a.openJobs || a.companyName.localeCompare(b.companyName),
    );

  return { total: rows.length, active: rows.filter((r) => r.isActive).length, rows: rows.slice(0, limit) };
}
