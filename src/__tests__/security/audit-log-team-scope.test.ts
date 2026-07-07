/**
 * @jest-environment node
 */

export {};

const agentFindLeanMock = jest.fn();
const agentFindSelectMock = jest.fn(() => ({ lean: agentFindLeanMock }));
const agentFindMock = jest.fn(() => ({ select: agentFindSelectMock }));

const saLeanMock = jest.fn();
const saSelectMock = jest.fn(() => ({ lean: saLeanMock }));
const saFindOneMock = jest.fn(() => ({ select: saSelectMock }));

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), find: agentFindMock },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: saFindOneMock },
}));

type TeamUserIdsFn = (saUserId: string) => Promise<{ toString(): string }[]>;
let getSuperAgentTeamUserIds: TeamUserIdsFn;
beforeAll(async () => {
  ({ getSuperAgentTeamUserIds } = await import("@/lib/auth/agentRestrictions"));
});

const SA_USER_ID = "64b000000000000000000001";
const AGENT_PROFILE_ID = "64b000000000000000000002";
const AGENT_USER_ID = "64b000000000000000000003";
const AGENT2_PROFILE_ID = "64b000000000000000000004";
const AGENT2_USER_ID = "64b000000000000000000005";

describe("getSuperAgentTeamUserIds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns only self when the super_agent has no team", async () => {
    saLeanMock.mockResolvedValue(null);
    const ids = await getSuperAgentTeamUserIds(SA_USER_ID);
    expect(ids.map(String)).toEqual([SA_USER_ID]);
    expect(agentFindMock).not.toHaveBeenCalled();
  });

  it("returns self + effective-scope agents' userIds", async () => {
    saLeanMock.mockResolvedValue({
      _id: "64b000000000000000000009",
      agentIds: [AGENT_PROFILE_ID, AGENT2_PROFILE_ID],
      assignedCityIds: [],
      assignedStateIds: [],
    });
    agentFindLeanMock.mockResolvedValue([
      { userId: AGENT_USER_ID },
      { userId: AGENT2_USER_ID },
    ]);

    const ids = await getSuperAgentTeamUserIds(SA_USER_ID);
    expect(ids.map(String).sort()).toEqual(
      [SA_USER_ID, AGENT_USER_ID, AGENT2_USER_ID].sort()
    );
  });

  it("deduplicates when an agent's userId collides with the super_agent's own id", async () => {
    saLeanMock.mockResolvedValue({
      _id: "64b000000000000000000009",
      agentIds: [AGENT_PROFILE_ID],
      assignedCityIds: [],
      assignedStateIds: [],
    });
    agentFindLeanMock.mockResolvedValue([{ userId: SA_USER_ID }]);

    const ids = await getSuperAgentTeamUserIds(SA_USER_ID);
    expect(ids.map(String)).toEqual([SA_USER_ID]);
  });
});
