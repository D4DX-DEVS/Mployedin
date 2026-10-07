import Agent from "@/models/Agent";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Job from "@/models/Job";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import type { DashboardPeriod } from "@/lib/admin/dashboard/period";
import { countsByKey, windowCount, windowRanges } from "./period";

/**
 * The agent's own work, scoped exactly like /api/agent/analytics (records whose
 * agentId is this agent's profile), but over the selected period instead of a
 * fixed 30 days. Commissions are left out (owner decision 2026-10-07: no money).
 * Returns null when the user has no agent profile — never an unscoped query.
 */
export async function buildAgentReport(userId: string, period: DashboardPeriod) {
  const agent = await Agent.findOne({ userId }).select("_id assignedEmployerIds").lean<{
    _id: unknown;
    assignedEmployerIds?: unknown[];
  } | null>();
  if (!agent) return null;

  const agentId = agent._id;
  const range = windowRanges(period);
  const [
    leadsTotal, leadsCurrent, leadsPrevious,
    applicationsTotal, applicationsCurrent, applicationsPrevious,
    interviewsCurrent, interviewsPrevious, interviewsScheduled,
    placementsTotal, placementsCurrent, placementsPrevious,
    activeJobs, leadsByStatus, applicationsByStatus,
  ] = await Promise.all([
    Lead.countDocuments({ agentId }),
    Lead.countDocuments({ agentId, createdAt: range.current }),
    Lead.countDocuments({ agentId, createdAt: range.previous }),
    Application.countDocuments({ agentId }),
    Application.countDocuments({ agentId, createdAt: range.current }),
    Application.countDocuments({ agentId, createdAt: range.previous }),
    Interview.countDocuments({ agentId, createdAt: range.current }),
    Interview.countDocuments({ agentId, createdAt: range.previous }),
    Interview.countDocuments({ agentId, status: "scheduled" }),
    Placement.countDocuments({ agentId }),
    Placement.countDocuments({ agentId, createdAt: range.current }),
    Placement.countDocuments({ agentId, createdAt: range.previous }),
    Job.countDocuments({ agentId, status: "active", deletedAt: null }),
    Lead.aggregate<{ _id: unknown; count: number }>([
      { $match: { agentId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Application.aggregate<{ _id: unknown; count: number }>([
      { $match: { agentId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  return {
    scope: "Your own work as an agent",
    totals: {
      assignedEmployers: agent.assignedEmployerIds?.length ?? 0,
      activeJobs,
      leads: leadsTotal,
      applications: applicationsTotal,
      placements: placementsTotal,
      scheduledInterviews: interviewsScheduled,
    },
    inPeriod: {
      leadsAdded: windowCount(leadsCurrent, leadsPrevious),
      applications: windowCount(applicationsCurrent, applicationsPrevious),
      interviewsArranged: windowCount(interviewsCurrent, interviewsPrevious),
      placements: windowCount(placementsCurrent, placementsPrevious),
    },
    leadsByStatus: countsByKey(leadsByStatus),
    applicationsByStatus: countsByKey(applicationsByStatus),
  };
}
