import type { Resource } from "@/types/user";
import type { DashboardPeriod } from "@/lib/admin/dashboard/period";
import { getPlatformSnapshot } from "@/lib/admin/dashboard/snapshot.server";
import { getRecruitmentOverview } from "@/lib/admin/dashboard/recruitment.server";
import { getPeopleOverview } from "@/lib/admin/dashboard/people.server";

/**
 * Platform-wide report for admins, built from the same functions as the admin
 * dashboard so both show the same numbers. Money (finance overview,
 * subscriptions, commissions) is left out on purpose — owner decision
 * 2026-10-07: MCP reports carry no money figures.
 *
 * `can` is the admin's live read permission per resource, applied block by
 * block exactly as the dashboard sections do (admin/_components/sections.tsx),
 * so an admin narrowed by custom permissions gets no more here than on screen.
 * Every field is picked by name: a field added upstream stays out until it is
 * added here on purpose.
 */
export async function buildAdminReport(period: DashboardPeriod, can: (resource: Resource) => boolean) {
  const show = {
    users: can("users"),
    jobs: can("jobs"),
    applications: can("applications"),
    interviews: can("interviews"),
    placements: can("placements"),
    employers: can("employers"),
    agents: can("agents"),
  };
  const wantsSnapshot = show.users || show.jobs || show.applications || show.interviews || show.placements;
  const wantsRecruitment = show.applications || show.jobs;
  const wantsPeople = show.users || show.employers || show.agents;

  const [snapshot, recruitment, people] = await Promise.all([
    wantsSnapshot ? getPlatformSnapshot(period) : null,
    wantsRecruitment ? getRecruitmentOverview(period) : null,
    wantsPeople ? getPeopleOverview(period, { employers: show.employers, agents: show.agents }) : null,
  ]);

  const jobs = recruitment?.jobs;
  const funnel = recruitment?.funnel;
  const employers = people?.employers;
  const agents = people?.agents;

  return {
    scope: "Whole platform",
    note: "Sections your account permissions don't cover are left out.",
    totals: snapshot
      ? {
          ...(show.users ? { users: snapshot.users } : {}),
          ...(show.jobs ? { activeJobs: snapshot.activeJobs } : {}),
          ...(show.applications ? { applications: snapshot.applications } : {}),
          ...(show.interviews ? { interviews: snapshot.interviews } : {}),
          ...(show.placements ? { placements: snapshot.placements } : {}),
          note: "total = all time (active jobs: open now); added = created inside the period vs the period before",
        }
      : undefined,
    applicationsByCurrentStatus:
      show.applications && recruitment
        ? recruitment.pipeline.map(({ status, count }) => ({ status, count }))
        : undefined,
    hiringFunnelAllTime:
      show.applications && funnel
        ? {
            applications: funnel.applications,
            reachedInterview: funnel.reachedInterview,
            reachedOffer: funnel.reachedOffer,
            hired: funnel.hired,
            avgHoursToFirstReview: funnel.avgHoursToFirstReview,
            avgDaysToHire: funnel.avgDaysToHire,
          }
        : undefined,
    jobHealth:
      show.jobs && jobs
        ? {
            activeJobs: jobs.activeJobs,
            lowVolume: jobs.lowVolume,
            expiringSoon: jobs.expiringSoon,
            paused: jobs.paused,
            drafts: jobs.drafts,
            expiredInPeriod: jobs.expiredInPeriod,
          }
        : undefined,
    usersByRole: show.users && people ? people.usersByRole.map(({ role, count }) => ({ role, count })) : undefined,
    employerActivity:
      show.employers && employers
        ? {
            companies: employers.companies,
            accounts: employers.accounts,
            accountsActive7d: employers.accountsActive7d,
            accountsInactive7d: employers.accountsInactive7d,
            newCompaniesInPeriod: employers.newCompaniesInPeriod,
            withoutActiveJob: employers.withoutActiveJob,
            activeJobsButNoApplications: employers.activeJobsButNoApplications,
          }
        : undefined,
    agentActivity:
      show.agents && agents
        ? {
            activeAgents: agents.activeAgents,
            signedInThisWeek: agents.signedInThisWeek,
            notSignedInThisWeek: agents.notSignedInThisWeek,
            targets: {
              behind: agents.targets.behind,
              onPace: agents.targets.onPace,
              achieved: agents.targets.achieved,
            },
            candidatesSourced: agents.candidatesSourced,
            interviewsArranged: agents.interviewsArranged,
            placements: agents.placements,
          }
        : undefined,
  };
}
