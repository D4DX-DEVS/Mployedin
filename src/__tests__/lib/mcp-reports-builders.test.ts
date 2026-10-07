/**
 * @jest-environment node
 */

/**
 * Each role's MCP report: scoped to the caller, default-deny without a
 * profile, and free of names (except job titles) and money figures.
 */

function chain(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ["select", "sort", "limit"]) q[method] = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(result);
  return q;
}

function modelMock() {
  return { findOne: jest.fn(), find: jest.fn(), countDocuments: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue([]) };
}

jest.mock("@/models/Agent", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/models/Lead", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/models/ProfileView", () => ({ __esModule: true, default: modelMock() }));
jest.mock("@/lib/dashboard/employerStats", () => ({ getEmployerDashboardStats: jest.fn() }));
jest.mock("@/lib/superAgent/dashboardData", () => ({ loadSuperAgentDashboard: jest.fn() }));
jest.mock("@/lib/admin/dashboard/snapshot.server", () => ({ getPlatformSnapshot: jest.fn() }));
jest.mock("@/lib/admin/dashboard/recruitment.server", () => ({ getRecruitmentOverview: jest.fn() }));
jest.mock("@/lib/admin/dashboard/people.server", () => ({ getPeopleOverview: jest.fn() }));

import Agent from "@/models/Agent";
import Application from "@/models/Application";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Lead from "@/models/Lead";
import { getEmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { loadSuperAgentDashboard } from "@/lib/superAgent/dashboardData";
import { getPlatformSnapshot } from "@/lib/admin/dashboard/snapshot.server";
import { getRecruitmentOverview } from "@/lib/admin/dashboard/recruitment.server";
import { getPeopleOverview } from "@/lib/admin/dashboard/people.server";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import { buildAgentReport } from "@/lib/mcp/reports/agent";
import { buildEmployerReport } from "@/lib/mcp/reports/employer";
import { buildJobSeekerReport } from "@/lib/mcp/reports/jobSeeker";
import { buildSuperAgentReport } from "@/lib/mcp/reports/superAgent";
import { buildAdminReport } from "@/lib/mcp/reports/admin";

type M = ReturnType<typeof modelMock>;
const m = (model: unknown) => model as M;
const period = resolveDashboardPeriod("30d", new Date("2026-10-07T00:00:00.000Z"));

/** Money and personal-data words that must never appear as keys in a report. */
const FORBIDDEN_KEY = /revenue|commission|amount|currency|salary|price|invoice|mrr|payout|name$|email|phone|userId|agentId/i;

function forbiddenKeys(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(FORBIDDEN_KEY.test(key) && key !== "jobTitle" ? [`${path}${key}`] : []),
    ...forbiddenKeys(child, `${path}${key}.`),
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const model of [Agent, Application, Employer, Job, JobSeeker, Lead]) {
    m(model).countDocuments.mockResolvedValue(0);
    m(model).aggregate.mockResolvedValue([]);
  }
});

describe("agent report", () => {
  it("returns null without an agent profile and runs no unscoped query", async () => {
    m(Agent).findOne.mockReturnValue(chain(null));
    await expect(buildAgentReport("u1", period)).resolves.toBeNull();
    expect(m(Lead).countDocuments).not.toHaveBeenCalled();
    expect(m(Application).countDocuments).not.toHaveBeenCalled();
  });

  it("scopes every count to the agent's own profile and carries no commissions", async () => {
    m(Agent).findOne.mockReturnValue(chain({ _id: "agent-1", assignedEmployerIds: ["e1", "e2"] }));
    m(Lead).countDocuments.mockResolvedValue(4);
    m(Lead).aggregate.mockResolvedValue([{ _id: "new", count: 3 }, { _id: "converted", count: 1 }]);
    const report = await buildAgentReport("u1", period);

    expect(report?.totals.assignedEmployers).toBe(2);
    expect(report?.leadsByStatus).toEqual({ new: 3, converted: 1 });
    for (const [filter] of m(Lead).countDocuments.mock.calls) expect(filter).toMatchObject({ agentId: "agent-1" });
    for (const [filter] of m(Application).countDocuments.mock.calls) expect(filter).toMatchObject({ agentId: "agent-1" });
    expect(forbiddenKeys(report)).toEqual([]);
  });
});

describe("employer report", () => {
  it("returns null without an employer profile", async () => {
    m(Employer).findOne.mockReturnValue(chain(null));
    await expect(buildEmployerReport("u1", period)).resolves.toBeNull();
    expect(getEmployerDashboardStats).not.toHaveBeenCalled();
  });

  it("is scoped to the company, names jobs by title only, and drops the company name", async () => {
    m(Employer).findOne.mockReturnValue(chain({ _id: "emp-1" }));
    (getEmployerDashboardStats as jest.Mock).mockResolvedValue({
      companyName: "Acme LLC", activeJobCount: 2, draftJobCount: 0, pausedJobCount: 0, totalApplications: 5,
      newApplications: 1, inReview: 2, scheduledInterviews: 1, interviewsToday: 0, hiredCount: 1, placements: 1,
      offerCount: 1, offersSent: 1, avgMatchScore: 71, highMatchCount: 1, band90PlusCount: 0, band80to89Count: 1,
      needsReviewCount: 3, lowMatchCount: 1, avgTimeToHire: 12, lastActivityMinutes: 5,
    });
    m(Job).find.mockReturnValue(chain([{ _id: "job-1", title: "Senior React Developer", status: "active", createdAt: new Date() }]));
    m(Application).aggregate.mockResolvedValue([
      { _id: { job: "job-1", status: "applied" }, count: 3 },
      { _id: { job: "job-1", status: "hired" }, count: 1 },
    ]);

    const report = await buildEmployerReport("u1", period);
    expect(m(Job).find).toHaveBeenCalledWith({ employerId: "emp-1", deletedAt: null });
    for (const [filter] of m(Application).countDocuments.mock.calls) expect(filter).toMatchObject({ employerId: "emp-1" });
    expect(report?.byJob).toEqual([
      expect.objectContaining({ jobTitle: "Senior React Developer", applicants: 4, applicantsByStatus: { applied: 3, hired: 1 } }),
    ]);
    expect(JSON.stringify(report)).not.toContain("Acme");
    expect(forbiddenKeys(report)).toEqual([]);
  });
});

describe("job seeker report", () => {
  it("returns null without a seeker profile", async () => {
    m(JobSeeker).findOne.mockReturnValue(chain(null));
    await expect(buildJobSeekerReport("u1", period)).resolves.toBeNull();
  });

  it("counts only the seeker's own applications", async () => {
    m(JobSeeker).findOne.mockReturnValue(chain({ _id: "seeker-1", userId: "u1" }));
    m(Application).aggregate
      .mockResolvedValueOnce([{ _id: "applied", count: 2 }])
      .mockResolvedValueOnce([{ avg: 76.4 }]);
    const report = await buildJobSeekerReport("u1", period);
    for (const [filter] of m(Application).countDocuments.mock.calls) expect(filter).toMatchObject({ jobSeekerId: "seeker-1" });
    expect(report?.applications.byStatus).toEqual({ applied: 2 });
    expect(report?.avgMatchScore).toBe(76);
    expect(forbiddenKeys(report)).toEqual([]);
  });
});

describe("super agent report", () => {
  it("leaves out named top agents, the region and pending commissions", async () => {
    (loadSuperAgentDashboard as jest.Mock).mockResolvedValue({
      timeZone: "Asia/Dubai",
      kpis: { activeAgents: 3, newAgentsThisMonth: 1, employers: 9, newEmployersThisMonth: 2, activeJobs: 7, jobsPostedThisMonth: 3, placementsThisMonth: 1, placementsLastMonth: 0 },
      funnel: { leads: 40, employers: 9, jobs: 12, applications: 88, placements: 5 },
      queue: { pendingExhibitions: 1, pendingCommissions: 4, overdueFollowUps: 2, inactiveAgents: 0, idleAgents: 1 },
      topAgents: [{ agentId: "a1", name: "Omar Ali", leads: 9, jobs: 2, applications: 20, placements: 1 }],
      activity: [{ month: "2026-09", leads: 5, jobs: 2, applications: 11 }],
      region: { name: "Dubai" },
    });
    const report = await buildSuperAgentReport("sa-user");
    expect(loadSuperAgentDashboard).toHaveBeenCalledWith("sa-user");
    const text = JSON.stringify(report);
    expect(text).not.toContain("Omar");
    expect(text).not.toContain("Dubai\"}");
    expect(report.needsAttention).not.toHaveProperty("pendingCommissions");
    expect(forbiddenKeys(report)).toEqual([]);
  });
});

describe("admin report", () => {
  it("uses the dashboard's platform functions and carries no money section", async () => {
    const metric = { total: 1, added: { current: 1, previous: 0 } };
    (getPlatformSnapshot as jest.Mock).mockResolvedValue({ users: metric, activeJobs: metric, applications: metric, interviews: metric, placements: metric });
    (getRecruitmentOverview as jest.Mock).mockResolvedValue({
      pipeline: [{ status: "applied", count: 3 }],
      jobs: { activeJobs: 1, lowVolume: 0, expiringSoon: 0, paused: 0, drafts: 0, expiredInPeriod: 0 },
      funnel: { applications: 3, reachedInterview: 1, reachedOffer: 0, hired: 0, avgHoursToFirstReview: null, avgDaysToHire: null },
    });
    (getPeopleOverview as jest.Mock).mockResolvedValue({
      usersByRole: [{ role: "job_seeker", count: 10 }],
      employers: { companies: 2, accounts: 3, accountsActive7d: 1, accountsInactive7d: 2, newCompaniesInPeriod: 0, withoutActiveJob: 1, activeJobsButNoApplications: 0 },
      agents: { activeAgents: 2, signedInThisWeek: 1, notSignedInThisWeek: 1, targets: { behind: 1, onPace: 0, achieved: 0 }, candidatesSourced: 0, interviewsArranged: 0, placements: 0 },
    });
    const report = await buildAdminReport(period, () => true);
    expect(getPeopleOverview).toHaveBeenCalledWith(period, { employers: true, agents: true });
    expect(report.hiringFunnelAllTime?.applications).toBe(3);
    expect(report.agentActivity?.targets).toEqual({ behind: 1, onPace: 0, achieved: 0 });
    expect(forbiddenKeys(report)).toEqual([]);
  });

  it("leaves out every section the admin's own permissions don't cover, like the dashboard", async () => {
    const metric = { total: 1, added: { current: 1, previous: 0 } };
    (getPlatformSnapshot as jest.Mock).mockResolvedValue({ users: metric, activeJobs: metric, applications: metric, interviews: metric, placements: metric });
    (getRecruitmentOverview as jest.Mock).mockResolvedValue({
      pipeline: [{ status: "applied", count: 3 }],
      jobs: { activeJobs: 1, lowVolume: 0, expiringSoon: 0, paused: 0, drafts: 0, expiredInPeriod: 0 },
      funnel: { applications: 3, reachedInterview: 1, reachedOffer: 0, hired: 0, avgHoursToFirstReview: null, avgDaysToHire: null },
    });
    const report = await buildAdminReport(period, (resource) => resource === "applications");

    expect(getPeopleOverview).not.toHaveBeenCalled();
    expect(Object.keys(report.totals ?? {})).toEqual(["applications", "note"]);
    expect(report.applicationsByCurrentStatus).toEqual([{ status: "applied", count: 3 }]);
    expect(report.jobHealth).toBeUndefined();
    expect(report.usersByRole).toBeUndefined();
    expect(report.employerActivity).toBeUndefined();
    expect(report.agentActivity).toBeUndefined();
  });

  it("runs no platform query for an admin who can read none of the sections", async () => {
    const report = await buildAdminReport(period, () => false);
    expect(getPlatformSnapshot).not.toHaveBeenCalled();
    expect(getRecruitmentOverview).not.toHaveBeenCalled();
    expect(getPeopleOverview).not.toHaveBeenCalled();
    expect(report.totals).toBeUndefined();
  });
});
