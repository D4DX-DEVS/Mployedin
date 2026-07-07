/**
 * @jest-environment node
 */

const employerLeanMock = jest.fn();
const employerSelectMock = jest.fn(() => ({ lean: employerLeanMock }));
const employerFindOneMock = jest.fn(() => ({ select: employerSelectMock }));

const agentLeanMock = jest.fn();
const agentSelectMock = jest.fn(() => ({ lean: agentLeanMock }));
const agentFindOneMock = jest.fn(() => ({ select: agentSelectMock }));

const saLeanMock = jest.fn();
const saSelectMock = jest.fn(() => ({ lean: saLeanMock }));
const saFindOneMock = jest.fn(() => ({ select: saSelectMock }));

const agentFindLeanMock = jest.fn();
const agentFindSelectMock = jest.fn(() => ({ lean: agentFindLeanMock }));
const agentFindMock = jest.fn(() => ({ select: agentFindSelectMock }));

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOne: employerFindOneMock, find: jest.fn() },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: agentFindOneMock, find: agentFindMock },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: saFindOneMock },
}));

type ScopeFn = (
  ctx: { userId: string; role: string },
  targetUserId: string
) => Promise<boolean>;
let canManageSubscriptionTarget: ScopeFn;
beforeAll(async () => {
  ({ canManageSubscriptionTarget } = await import("@/lib/auth/agentRestrictions"));
});

const EMPLOYER_ID = "64b000000000000000000001";
const AGENT_PROFILE_ID = "64b000000000000000000002";
const OTHER_AGENT_ID = "64b000000000000000000003";
const TARGET_USER_ID = "64b000000000000000000004";

describe("canManageSubscriptionTarget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows admin for any target", async () => {
    await expect(
      canManageSubscriptionTarget({ userId: "x", role: "admin" }, TARGET_USER_ID)
    ).resolves.toBe(true);
    expect(employerFindOneMock).not.toHaveBeenCalled();
  });

  it("denies non-agent roles (employer, job_seeker)", async () => {
    await expect(
      canManageSubscriptionTarget({ userId: "x", role: "employer" }, TARGET_USER_ID)
    ).resolves.toBe(false);
  });

  it("denies agent when target user has no employer profile (job_seeker target)", async () => {
    employerLeanMock.mockResolvedValue(null);
    await expect(
      canManageSubscriptionTarget({ userId: "agent-user", role: "agent" }, TARGET_USER_ID)
    ).resolves.toBe(false);
  });

  it("allows agent when employer.agentId matches their agent profile", async () => {
    employerLeanMock.mockResolvedValue({ _id: EMPLOYER_ID, agentId: AGENT_PROFILE_ID });
    agentLeanMock.mockResolvedValue({ _id: AGENT_PROFILE_ID, assignedEmployerIds: [] });
    await expect(
      canManageSubscriptionTarget({ userId: "agent-user", role: "agent" }, TARGET_USER_ID)
    ).resolves.toBe(true);
  });

  it("denies agent when employer belongs to a different agent", async () => {
    employerLeanMock.mockResolvedValue({ _id: EMPLOYER_ID, agentId: OTHER_AGENT_ID });
    agentLeanMock.mockResolvedValue({ _id: AGENT_PROFILE_ID, assignedEmployerIds: [] });
    await expect(
      canManageSubscriptionTarget({ userId: "agent-user", role: "agent" }, TARGET_USER_ID)
    ).resolves.toBe(false);
  });

  it("allows super_agent when employer's agent is in their team scope", async () => {
    employerLeanMock.mockResolvedValue({ _id: EMPLOYER_ID, agentId: AGENT_PROFILE_ID });
    // getSuperAgentScope: SuperAgent.findOne → team agentIds; Agent.find → region agents
    saLeanMock.mockResolvedValue({
      _id: "64b000000000000000000005",
      agentIds: [AGENT_PROFILE_ID],
      assignedCityIds: [],
      assignedStateIds: [],
    });
    agentFindLeanMock.mockResolvedValue([]);
    await expect(
      canManageSubscriptionTarget({ userId: "sa-user", role: "super_agent" }, TARGET_USER_ID)
    ).resolves.toBe(true);
  });

  it("denies super_agent when employer's agent is outside their scope", async () => {
    employerLeanMock.mockResolvedValue({ _id: EMPLOYER_ID, agentId: OTHER_AGENT_ID });
    saLeanMock.mockResolvedValue({
      _id: "64b000000000000000000005",
      agentIds: [AGENT_PROFILE_ID],
      assignedCityIds: [],
      assignedStateIds: [],
    });
    agentFindLeanMock.mockResolvedValue([]);
    await expect(
      canManageSubscriptionTarget({ userId: "sa-user", role: "super_agent" }, TARGET_USER_ID)
    ).resolves.toBe(false);
  });
});
