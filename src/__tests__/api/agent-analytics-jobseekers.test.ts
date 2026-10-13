/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const AGENT_ID = "660000000000000000000001";
const USER_ID = "user_agent_1";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) =>
    async (req: NextRequest) =>
      handler(req, { userId: USER_ID, role: "agent", locale: "en" }),
}));

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getAgentEmployerIds: jest.fn(async () => []),
  getAgentSeekerArea: jest.fn(async () => ({ assignedCityIds: [], assignedStateIds: [] })),
  seekerRegionMatch: jest.fn(() => null),
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: () => ({
        lean: async () => ({
          _id: AGENT_ID,
          assignedEmployerIds: [],
          assignedJobSeekerIds: [],
          assignedCityIds: [],
          assignedStateIds: [],
          performance: {},
          commissionRate: 0.1,
        }),
      }),
    })),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(async () => 0), find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })) },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(async () => 0), aggregate: jest.fn(async () => []) },
}));

jest.mock("@/models/Lead", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(async () => 0), aggregate: jest.fn(async () => []) },
}));

jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(async () => 0), aggregate: jest.fn(async () => []) },
}));

jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: { aggregate: jest.fn(async () => []) },
}));

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(async () => 0) },
}));

jest.mock("@/models/Offer", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn(async () => 0) },
}));

const jobSeekerDocs: unknown[] = [];
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(async () => jobSeekerDocs.length),
    find: jest.fn(() => ({
      select: () => ({
        lean: async () => jobSeekerDocs,
      }),
    })),
  },
}));

async function getAnalytics() {
  const { GET } = await import("@/app/api/agent/analytics/route");
  const res = await GET(new NextRequest("http://localhost:3888/api/agent/analytics"), { params: Promise.resolve({}) });
  return res.json();
}

describe("GET /api/agent/analytics — Job Seekers", () => {
  beforeEach(() => {
    jobSeekerDocs.length = 0;
    jest.clearAllMocks();
  });

  it("reports onboarded, premium, area and referral figures", async () => {
    jobSeekerDocs.push({ _id: "seeker_1", careerProfile: { jobRole: "Electrician" } });
    const data = await getAnalytics();
    expect(data.jobSeekers).toEqual(expect.objectContaining({
      onboarded: expect.any(Number),
      onboardedPremium: expect.any(Number),
      inArea: 0,
      premiumInArea: 0,
      areaAssigned: false,
      referred: expect.any(Number),
      referredLastMonth: expect.any(Number),
      professionTotal: 1,
    }));
  });

  // The agent doc must carry the region and assigned seekers, or "in my
  // area" is always empty and assigned seekers never count as onboarded.
  it("loads the agent's region and assigned seekers", async () => {
    const Agent = (await import("@/models/Agent")).default as unknown as { findOne: jest.Mock };
    const selected: string[] = [];
    Agent.findOne.mockImplementationOnce(() => ({
      select: (fields: string) => { selected.push(fields); return { lean: async () => ({ _id: AGENT_ID, assignedJobSeekerIds: [], assignedCityIds: [], assignedStateIds: [] }) }; },
    }));
    await getAnalytics();
    expect(selected[0]).toEqual(expect.stringContaining("assignedCityIds"));
    expect(selected[0]).toEqual(expect.stringContaining("assignedJobSeekerIds"));
    expect(selected[0]).toEqual(expect.stringContaining("superAgentId"));
  });

  it("groups seekers by profession with translatable sentinels", async () => {
    jobSeekerDocs.push(
      { _id: "s1", careerProfile: { jobRole: "software engineer – ACME (2023–present)" } },
      { _id: "s2", preferredRoles: ["Software Engineer"] },
      { _id: "s3", experience: [{ jobTitle: "Driver, ACME Logistics, Dubai (2024–Present)", isCurrent: true }] },
      { _id: "s4" },
    );
    const data = await getAnalytics();
    expect(data.jobSeekers.professionBreakdown).toEqual([
      { profession: "Software Engineer", count: 2 },
      { profession: "Driver", count: 1 },
      { profession: "__not_specified__", count: 1 },
    ]);
  });
});
