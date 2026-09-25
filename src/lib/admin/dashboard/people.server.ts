import Employer from "@/models/Employer";
import Interview from "@/models/Interview";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Placement from "@/models/Placement";
import TargetProfile from "@/models/TargetProfile";
import User from "@/models/User";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import type { DashboardPeriod } from "./period";
import { ACTIVE_JOB_FILTER, getUserRoleCounts } from "./shared.server";
import type { AgentOperations, EmployerHealth, PeopleOverview } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Company profiles still in use — a role conversion archives rather than deletes. */
const LIVE_COMPANY = { roleArchivedAt: null };

/** Active accounts of a role: not deactivated. */
function liveAccounts(role: "employer" | "agent") {
  return { role, isActive: { $ne: false } };
}

export async function getEmployerHealth(period: DashboardPeriod): Promise<EmployerHealth> {
  const { now, start } = period;
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [companies, newCompaniesInPeriod, accounts, accountsActive7d, employersWithActiveJobs, employersWithAppliedJobs] =
    await Promise.all([
      Employer.countDocuments(LIVE_COMPANY),
      Employer.countDocuments({ ...LIVE_COMPANY, createdAt: { $gte: start } }),
      User.countDocuments(liveAccounts("employer")),
      User.countDocuments({ ...liveAccounts("employer"), lastLogin: { $gte: weekAgo } }),
      Job.distinct("employerId", ACTIVE_JOB_FILTER),
      // Companies with at least one application on an active job.
      Job.aggregate<{ _id: unknown }>([
        { $match: { ...ACTIVE_JOB_FILTER } },
        {
          $lookup: {
            from: "applications",
            let: { jobId: "$_id" },
            pipeline: [{ $match: { $expr: { $eq: ["$jobId", "$$jobId"] } } }, { $limit: 1 }],
            as: "applications",
          },
        },
        { $match: { "applications.0": { $exists: true } } },
        { $group: { _id: "$employerId" } },
      ]),
    ]);

  const withActiveJob = await Employer.countDocuments({ ...LIVE_COMPANY, _id: { $in: employersWithActiveJobs } });
  const applied = new Set(employersWithAppliedJobs.map((row) => String(row._id)));
  const activeButEmpty = employersWithActiveJobs.filter((id) => !applied.has(String(id)));
  const activeJobsButNoApplications = activeButEmpty.length
    ? await Employer.countDocuments({ ...LIVE_COMPANY, _id: { $in: activeButEmpty } })
    : 0;

  return {
    companies,
    accounts,
    accountsActive7d,
    // Never signed in counts as inactive, the same as a sign-in over a week ago.
    accountsInactive7d: Math.max(0, accounts - accountsActive7d),
    newCompaniesInPeriod,
    withoutActiveJob: Math.max(0, companies - withActiveJob),
    activeJobsButNoApplications,
  };
}

/**
 * A profile's pace against the year so far — the same `riskScore` the target
 * report computes: behind when more than 10 points under the expected share.
 */
export function targetPace(profile: { overallProgress: number; riskScore: "high" | "medium" | "low" }): "behind" | "onPace" | "achieved" {
  if (profile.overallProgress >= 100) return "achieved";
  return profile.riskScore === "low" ? "onPace" : "behind";
}

export async function getAgentOperations(period: DashboardPeriod): Promise<AgentOperations> {
  const { now, start } = period;
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [activeAgents, signedInThisWeek, profiles, candidatesSourced, interviewsArranged, placements] = await Promise.all([
    User.countDocuments(liveAccounts("agent")),
    User.countDocuments({ ...liveAccounts("agent"), lastLogin: { $gte: weekAgo } }),
    TargetProfile.find({ status: "active", year: now.getFullYear() }).lean(),
    JobSeeker.countDocuments({ isAgentReferred: true, createdAt: { $gte: start } }),
    Interview.countDocuments({ agentId: { $ne: null }, createdAt: { $gte: start } }),
    Placement.countDocuments({ agentId: { $ne: null }, placedAt: { $gte: start } }),
  ]);

  const enriched = profiles.length ? await enrichProfiles(profiles as unknown as Record<string, unknown>[]) : [];
  const targets = { behind: 0, onPace: 0, achieved: 0 };
  for (const profile of enriched) targets[targetPace(profile)] += 1;

  return {
    activeAgents,
    signedInThisWeek,
    notSignedInThisWeek: Math.max(0, activeAgents - signedInThisWeek),
    targets,
    candidatesSourced,
    interviewsArranged,
    placements,
  };
}

/** Users by role always; the employer and agent panels only for admins who may read them. */
export async function getPeopleOverview(
  period: DashboardPeriod,
  access: { employers: boolean; agents: boolean },
): Promise<PeopleOverview> {
  const [usersByRole, employers, agents] = await Promise.all([
    getUserRoleCounts(),
    access.employers ? getEmployerHealth(period) : null,
    access.agents ? getAgentOperations(period) : null,
  ]);
  return { usersByRole, employers, agents };
}
