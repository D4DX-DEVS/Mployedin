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
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: async () => scope }));

import { canStaffAccessSeeker } from "@/lib/jobSeeker/staffAccess";

const ctx = (role: string) => ({ userId: "u1", role });
const seeker = (extra: Record<string, unknown> = {}) => ({ _id: SEEKER, ...extra });

beforeEach(() => {
  agentDoc = { _id: AGENT, assignedJobSeekerIds: [] };
  saDoc = { _id: SA };
  scope = { effectiveAgentIds: [AGENT] };
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
