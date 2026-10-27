/**
 * @jest-environment node
 *
 * job-seekers/[id] must allow exactly the seekers /api/job-seekers lists for
 * that staff member. It checked `seeker.agentId` only, so seekers who joined
 * through an agent's (or a super-agent team's) referral link — which never
 * writes agentId — were listed, then 403'd when opened or edited.
 */
const AGENT = "660000000000000000000001";
const OTHER_AGENT = "660000000000000000000009";
const SA = "660000000000000000000002";
const SEEKER = "770000000000000000000001";

let agentDoc: unknown = { _id: AGENT, assignedJobSeekerIds: [] };
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: async () => agentDoc }) }) },
}));
let saDoc: unknown = { _id: SA };
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: async () => saDoc }) }) },
}));
let scope: unknown = { effectiveAgentIds: [AGENT] };
const CITY = "880000000000000000000001";
const OTHER_CITY = "880000000000000000000002";
const STATE = "880000000000000000000010";
let territory: unknown = { assignedCityIds: [CITY], assignedStateIds: [] };
const getSuperAgentTerritory = jest.fn(async () => territory);
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: async () => scope,
  getSuperAgentTerritory: () => getSuperAgentTerritory(),
  seekerInRegion: jest.requireActual("@/lib/auth/regionMatch").seekerInRegion,
}));

import { canStaffAccessSeeker, seekersSuperAgentCanView } from "@/lib/jobSeeker/staffAccess";

const ctx = (role: string) => ({ userId: "u1", role });
const seeker = (extra: Record<string, unknown> = {}) => ({ _id: SEEKER, ...extra });

beforeEach(() => {
  agentDoc = { _id: AGENT, assignedJobSeekerIds: [] };
  saDoc = { _id: SA };
  scope = { effectiveAgentIds: [AGENT] };
  territory = { assignedCityIds: [CITY], assignedStateIds: [] };
  getSuperAgentTerritory.mockClear();
});

describe("agent", () => {
  it("owns seekers assigned by agentId", async () => {
    expect(await canStaffAccessSeeker(seeker({ agentId: AGENT }), ctx("agent"))).toBe(true);
  });
  it("owns seekers who joined through their referral link", async () => {
    expect(await canStaffAccessSeeker(seeker({ referral: { agentId: AGENT } }), ctx("agent"))).toBe(true);
  });
  it("owns seekers in their assignedJobSeekerIds", async () => {
    agentDoc = { _id: AGENT, assignedJobSeekerIds: [SEEKER] };
    expect(await canStaffAccessSeeker(seeker(), ctx("agent"))).toBe(true);
  });
  it("is refused another agent's seeker", async () => {
    expect(await canStaffAccessSeeker(seeker({ agentId: OTHER_AGENT, referral: { agentId: OTHER_AGENT } }), ctx("agent"))).toBe(false);
  });
  it("is refused everything without an Agent profile", async () => {
    agentDoc = null;
    expect(await canStaffAccessSeeker(seeker({ agentId: AGENT }), ctx("agent"))).toBe(false);
  });
});

describe("super_agent", () => {
  it("reaches seekers owned or referred by a team agent", async () => {
    expect(await canStaffAccessSeeker(seeker({ agentId: AGENT }), ctx("super_agent"))).toBe(true);
    expect(await canStaffAccessSeeker(seeker({ referral: { agentId: AGENT } }), ctx("super_agent"))).toBe(true);
  });
  it("reaches seekers they referred themselves", async () => {
    scope = { effectiveAgentIds: [] };
    expect(await canStaffAccessSeeker(seeker({ referral: { superAgentId: SA } }), ctx("super_agent"))).toBe(true);
  });
  it("is refused seekers outside the team", async () => {
    expect(await canStaffAccessSeeker(seeker({ agentId: OTHER_AGENT }), ctx("super_agent"))).toBe(false);
  });
  it("is refused everything without a scope", async () => {
    scope = null; saDoc = null;
    expect(await canStaffAccessSeeker(seeker({ agentId: AGENT }), ctx("super_agent"))).toBe(false);
  });
});

it("admin reaches everyone; employer and job seeker reach no one here", async () => {
  expect(await canStaffAccessSeeker(seeker(), ctx("admin"))).toBe(true);
  expect(await canStaffAccessSeeker(seeker({ agentId: AGENT }), ctx("employer"))).toBe(false);
  expect(await canStaffAccessSeeker(seeker({ agentId: AGENT }), ctx("job_seeker"))).toBe(false);
});

/**
 * A super agent's job matches list marks which candidates they may open.
 * The flag must match what GET /api/job-seekers/[id] then allows ("view"):
 * team-owned, their own referral, or a visible seeker in their territory —
 * never a hidden profile or one outside the territory.
 */
describe("seekersSuperAgentCanView", () => {
  const ids = async (seekers: Record<string, unknown>[]) =>
    [...(await seekersSuperAgentCanView("u1", seekers.map((s) => ({ _id: "", ...s }))))].sort();

  it("allows team-owned, self-referred and in-territory seekers", async () => {
    expect(
      await ids([
        { _id: "a", agentId: AGENT },
        { _id: "b", referral: { superAgentId: SA } },
        { _id: "c", regionCityId: CITY, profileVisibility: "visible" },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  it("refuses seekers outside the territory, hidden ones and converted accounts", async () => {
    expect(
      await ids([
        { _id: "out", regionCityId: OTHER_CITY, profileVisibility: "visible" },
        { _id: "hidden", regionCityId: CITY, profileVisibility: "hidden" },
        { _id: "archived", regionCityId: CITY, profileVisibility: "visible", roleArchivedAt: new Date() },
        { _id: "nowhere", agentId: OTHER_AGENT },
      ]),
    ).toEqual([]);
  });

  it("covers a whole state when the territory holds it", async () => {
    territory = { assignedCityIds: [], assignedStateIds: [STATE] };
    expect(await ids([{ _id: "s", regionCityId: OTHER_CITY, regionStateId: STATE, profileVisibility: "visible" }])).toEqual(["s"]);
  });

  it("gives the same answer as canStaffAccessSeeker, one seeker at a time", async () => {
    const seekers = [
      seeker({ agentId: AGENT }),
      { _id: "770000000000000000000002", regionCityId: CITY, profileVisibility: "visible" },
      { _id: "770000000000000000000003", regionCityId: OTHER_CITY, profileVisibility: "visible" },
      { _id: "770000000000000000000004", regionCityId: CITY, profileVisibility: "hidden" },
    ];
    const batch = await seekersSuperAgentCanView("u1", seekers);
    for (const s of seekers) {
      expect(batch.has(String(s._id))).toBe(await canStaffAccessSeeker(s, ctx("super_agent"), "view"));
    }
  });

  it("reads the territory once per page, and not at all when every seeker is owned", async () => {
    await seekersSuperAgentCanView("u1", [{ _id: "a", agentId: AGENT }, { _id: "b", agentId: AGENT }]);
    expect(getSuperAgentTerritory).not.toHaveBeenCalled();
    await seekersSuperAgentCanView("u1", [{ _id: "c", regionCityId: CITY }, { _id: "d", regionCityId: OTHER_CITY }]);
    expect(getSuperAgentTerritory).toHaveBeenCalledTimes(1);
  });

  it("allows no one without a super agent profile or scope", async () => {
    scope = null; saDoc = null; territory = null;
    expect(await ids([{ _id: "a", agentId: AGENT }, { _id: "c", regionCityId: CITY, profileVisibility: "visible" }])).toEqual([]);
  });
});
