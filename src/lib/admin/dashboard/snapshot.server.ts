import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Job from "@/models/Job";
import Placement from "@/models/Placement";
import User from "@/models/User";
import type { DashboardPeriod } from "./period";
import { countActiveJobs, getUserRoleCounts } from "./shared.server";
import type { PlatformSnapshot } from "./types";

/** Applications carry `appliedAt`; a few legacy rows only have `createdAt`. */
function appliedBetween(start: Date, end?: Date) {
  const range = end ? { $gte: start, $lt: end } : { $gte: start };
  return {
    $or: [
      { appliedAt: range },
      { $and: [{ $or: [{ appliedAt: { $exists: false } }, { appliedAt: null }] }, { createdAt: range }] },
    ],
  };
}

/**
 * The five platform totals, each with what was added in the period and the
 * period before. These numbers appear nowhere else on the dashboard.
 */
export async function getPlatformSnapshot(period: DashboardPeriod): Promise<PlatformSnapshot> {
  const { start, previousStart } = period;
  const current = { $gte: start };
  const previous = { $gte: previousStart, $lt: start };

  const [
    roles,
    usersAdded,
    usersPrevious,
    activeJobs,
    jobsOpened,
    jobsOpenedPrevious,
    applications,
    applicationsAdded,
    applicationsPrevious,
    interviews,
    interviewsAdded,
    interviewsPrevious,
    placements,
    placementsAdded,
    placementsPrevious,
  ] = await Promise.all([
    getUserRoleCounts(),
    User.countDocuments({ createdAt: current }),
    User.countDocuments({ createdAt: previous }),
    countActiveJobs(),
    Job.countDocuments({ deletedAt: null, createdAt: current }),
    Job.countDocuments({ deletedAt: null, createdAt: previous }),
    Application.countDocuments(),
    Application.countDocuments(appliedBetween(start)),
    Application.countDocuments(appliedBetween(previousStart, start)),
    Interview.countDocuments(),
    Interview.countDocuments({ createdAt: current }),
    Interview.countDocuments({ createdAt: previous }),
    Placement.countDocuments(),
    Placement.countDocuments({ placedAt: current }),
    Placement.countDocuments({ placedAt: previous }),
  ]);

  return {
    users: { total: roles.reduce((sum, row) => sum + row.count, 0), added: { current: usersAdded, previous: usersPrevious } },
    activeJobs: { total: activeJobs, added: { current: jobsOpened, previous: jobsOpenedPrevious } },
    applications: { total: applications, added: { current: applicationsAdded, previous: applicationsPrevious } },
    interviews: { total: interviews, added: { current: interviewsAdded, previous: interviewsPrevious } },
    placements: { total: placements, added: { current: placementsAdded, previous: placementsPrevious } },
  };
}
