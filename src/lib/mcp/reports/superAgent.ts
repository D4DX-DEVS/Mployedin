import { loadSuperAgentDashboard } from "@/lib/superAgent/dashboardData";

/**
 * Territory report for a super agent: the super-agent dashboard's own figures
 * (same scope — getSuperAgentScope / getSuperAgentBook). Left out: the
 * per-agent "top agents" rows (names), the region name, and pending
 * commissions (money-related; owner decision 2026-10-07).
 */
export async function buildSuperAgentReport(userId: string) {
  const data = await loadSuperAgentDashboard(userId);
  return {
    scope: "Your territory: you and your agents",
    timeZone: data.timeZone,
    calendarMonths: {
      note: "This report counts calendar months in your time zone; the period option does not apply.",
      activeAgents: data.kpis.activeAgents,
      newAgentsThisMonth: data.kpis.newAgentsThisMonth,
      employers: data.kpis.employers,
      newEmployersThisMonth: data.kpis.newEmployersThisMonth,
      activeJobs: data.kpis.activeJobs,
      jobsPostedThisMonth: data.kpis.jobsPostedThisMonth,
      placementsThisMonth: data.kpis.placementsThisMonth,
      placementsLastMonth: data.kpis.placementsLastMonth,
    },
    volumeAllTime: {
      note: "Each stage is a different record type, so these are volumes, not conversion rates.",
      leads: data.funnel.leads,
      employers: data.funnel.employers,
      jobs: data.funnel.jobs,
      applications: data.funnel.applications,
      placements: data.funnel.placements,
    },
    needsAttention: {
      overdueFollowUps: data.queue.overdueFollowUps,
      pendingExhibitions: data.queue.pendingExhibitions,
      inactiveAgents: data.queue.inactiveAgents,
      idleAgents: data.queue.idleAgents,
    },
    monthlyActivity: data.activity.map(({ month, leads, jobs, applications }) => ({ month, leads, jobs, applications })),
  };
}
