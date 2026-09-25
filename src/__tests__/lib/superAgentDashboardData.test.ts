/**
 * @jest-environment node
 */
/**
 * loadSuperAgentDashboard — the figures behind the super-agent home.
 * Guards the parts that are easy to get quietly wrong: "this month" in the
 * SA's time zone, placements this vs last month by placedAt, six months of
 * activity keyed by local month, the top-agents order — and that each card
 * counts with the same filter as the list page it opens.
 */
import { loadSuperAgentDashboard } from "@/lib/superAgent/dashboardData";

const A1 = { toString: () => "a1" };
const A2 = { toString: () => "a2" };
const OWNERSHIP = { $or: [{ agentId: { $in: [A1, A2] } }, { employerId: { $in: ["e1"] } }] };

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn(async () => ({
    saProfileId: "sa1",
    teamAgentIds: [],
    regionAgentIds: [],
    effectiveAgentIds: [A1, A2],
    assignedCityIds: ["c_tirur"],
    assignedStateIds: [],
  })),
  // The jobs list's scope (/api/super-agent/jobs); the loader must reuse it.
  getSuperAgentBook: jest.fn(async () => ({ agentIds: [A1, A2], employerIds: ["e1"], saProfileId: "sa1", ownershipMatch: OWNERSHIP })),
}));

jest.mock("@/lib/agentPerformance", () => ({
  EMPTY_AGENT_PERFORMANCE: { leadsGenerated: 0, employersCreated: 0, vacanciesPosted: 0, jobSeekersSubmitted: 0, interviewsScheduled: 0, placementsCompleted: 0 },
  getLiveAgentPerformance: jest.fn(async () => new Map([
    ["a1", { leadsGenerated: 66, employersCreated: 0, vacanciesPosted: 24, jobSeekersSubmitted: 31, interviewsScheduled: 0, placementsCompleted: 0 }],
    ["a2", { leadsGenerated: 8, employersCreated: 0, vacanciesPosted: 3, jobSeekersSubmitted: 2, interviewsScheduled: 0, placementsCompleted: 1 }],
  ])),
}));

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const placementCount = jest.fn();
const leadAggregate = jest.fn();
const jobAggregate = jest.fn();
const appAggregate = jest.fn();

jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: () => chain({ timezone: "Asia/Kolkata" }) } }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: () => chain([{ _id: "a1", userId: "u1" }, { _id: "a2", userId: "u2" }]),
    countDocuments: jest.fn(async () => 1),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(async () => 2),
    find: () => chain([{ _id: "u1", name: "Agent Rajesh" }, { _id: "u2", name: "Agent Anita" }]),
  },
}));
const employerCount = jest.fn();
const jobCount = jest.fn();
const leadCount = jest.fn();
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => employerCount(...a) } }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    countDocuments: (...a: unknown[]) => jobCount(...a),
    find: () => chain([{ _id: "j1" }]),
    aggregate: (...a: unknown[]) => jobAggregate(...a),
  },
}));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(async () => 7), aggregate: (...a: unknown[]) => appAggregate(...a) },
}));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => placementCount(...a) } }));
jest.mock("@/models/Lead", () => ({
  __esModule: true,
  default: {
    countDocuments: (...a: unknown[]) => leadCount(...a),
    distinct: jest.fn(async () => ["a1"]),
    aggregate: (...a: unknown[]) => leadAggregate(...a),
  },
}));
jest.mock("@/models/Commission", () => ({ __esModule: true, default: { countDocuments: jest.fn(async () => 0) } }));
jest.mock("@/models/ExhibitionRequest", () => ({ __esModule: true, default: { countDocuments: jest.fn(async () => 15) } }));

// 20:00Z on 30 Sep = 01:30 IST on 1 Oct: "this month" is October in Kolkata.
const NOW = new Date("2026-09-30T20:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  employerCount.mockImplementation(async (f: { createdAt?: unknown }) => (f.createdAt ? 2 : 25));
  jobCount.mockImplementation(async (f: { status?: string }) => (f.status === "active" ? 49 : 90));
  leadCount.mockImplementation(async (f: { followUpAt?: unknown }) => (f.followUpAt ? 4 : 20));
  placementCount.mockImplementation(async (filter: { placedAt?: { $lt?: Date } }) => {
    if (!filter.placedAt) return 9; // all time
    return filter.placedAt.$lt ? 1 : 3; // last month : this month
  });
  leadAggregate.mockResolvedValue([{ _id: "2026-10", count: 4 }, { _id: "2026-06", count: 2 }]);
  jobAggregate.mockResolvedValue([{ _id: "2026-10", count: 1 }]);
  appAggregate.mockResolvedValue([{ _id: "2026-09", count: 6 }]);
});

describe("loadSuperAgentDashboard", () => {
  it("counts this month and last month in the super-agent's own time zone", async () => {
    const data = await loadSuperAgentDashboard("sa_user", NOW);

    expect(data.timeZone).toBe("Asia/Kolkata");
    expect(data.kpis.placementsThisMonth).toBe(3);
    expect(data.kpis.placementsLastMonth).toBe(1);
    expect(data.funnel.placements).toBe(9);
    // October starts at 18:30Z on 30 Sep in Kolkata; September at 18:30Z on 31 Aug.
    expect(placementCount).toHaveBeenCalledWith(expect.objectContaining({
      placedAt: { $gte: new Date("2026-09-30T18:30:00Z") },
    }));
    expect(placementCount).toHaveBeenCalledWith(expect.objectContaining({
      placedAt: { $gte: new Date("2026-08-31T18:30:00Z"), $lt: new Date("2026-09-30T18:30:00Z") },
    }));
  });

  it("buckets six months of activity by local month, oldest first, zero-filling gaps", async () => {
    const data = await loadSuperAgentDashboard("sa_user", NOW);

    expect(data.activity.map((m) => m.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(data.activity[1]).toEqual({ month: "2026-06", leads: 2, jobs: 0, applications: 0 });
    expect(data.activity[5]).toEqual({ month: "2026-10", leads: 4, jobs: 1, applications: 0 });
    expect(data.activity[4].applications).toBe(6);
    // Grouped in the SA's zone, from the start of the oldest month.
    const [pipeline] = leadAggregate.mock.calls[0] as [Record<string, Record<string, unknown>>[]];
    expect(pipeline[0].$match.createdAt).toEqual({ $gte: new Date("2026-04-30T18:30:00Z") });
    expect(JSON.stringify(pipeline[1])).toContain('"timezone":"Asia/Kolkata"');
  });

  it("ranks top agents by placements, then applications, with live figures", async () => {
    const data = await loadSuperAgentDashboard("sa_user", NOW);
    expect(data.topAgents.map((a) => a.name)).toEqual(["Agent Anita", "Agent Rajesh"]);
    expect(data.topAgents[1]).toEqual({ agentId: "a1", name: "Agent Rajesh", leads: 66, jobs: 24, applications: 31, placements: 0 });
  });

  it("counts each card with its destination list's own filter", async () => {
    const data = await loadSuperAgentDashboard("sa_user", NOW);

    // Employers: the employers list's query — agentId on the employer, archived conversions out.
    expect(data.kpis.employers).toBe(25);
    expect(data.funnel.employers).toBe(25);
    expect(employerCount).toHaveBeenCalledWith({ agentId: { $in: [A1, A2] }, roleArchivedAt: null });
    expect(data.kpis.newEmployersThisMonth).toBe(2);

    // Jobs: the jobs list's getSuperAgentBook scope, active = status "active".
    expect(data.kpis.activeJobs).toBe(49);
    expect(data.funnel.jobs).toBe(90);
    expect(jobCount).toHaveBeenCalledWith({ deletedAt: null, ...OWNERSHIP, status: "active" });

    // Leads: the leads list's scope, team leads plus the SA's own; overdue = still open.
    const leadScope = { $or: [{ agentId: { $in: [A1, A2] } }, { superAgentId: "sa1" }] };
    expect(data.funnel.leads).toBe(20);
    expect(leadCount).toHaveBeenCalledWith(leadScope);
    expect(data.queue.overdueFollowUps).toBe(4);
    expect(leadCount).toHaveBeenCalledWith({ ...leadScope, followUpAt: { $lt: NOW }, status: { $nin: ["converted", "lost"] } });
  });

  it("derives the queue counts", async () => {
    const data = await loadSuperAgentDashboard("sa_user", NOW);
    expect(data.queue.pendingExhibitions).toBe(15);
    expect(data.queue.inactiveAgents).toBe(0); // 2 agents, 2 active
    expect(data.queue.idleAgents).toBe(1); // a2 has no lead
    expect(data.region).toEqual({ assignedCityIds: ["c_tirur"], assignedStateIds: [] });
  });
});
