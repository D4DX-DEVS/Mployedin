/**
 * @jest-environment node
 *
 * The owner treats a super agent's region as the district (2026-10-02): an
 * agent in Tirur under a super agent who covers the Malappuram towns sees the
 * job seekers of all of them. getAgentSeekerArea is that area — the agent's own
 * cities/states plus their super agent's whole territory.
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const TIRUR = "550000000000000000000001";
const MALAPPURAM = "550000000000000000000002";
const PONNANI = "550000000000000000000003";
const KERALA = "540000000000000000000001";
const SA_DOC = "660000000000000000000002";
const SA_USER = "880000000000000000000002";
const TEAM_AGENT = "660000000000000000000003";

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  c.select = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

let saById: Record<string, unknown> | null;
let saByUser: Record<string, unknown> | null;
let teamAgents: Array<Record<string, unknown>>;
const findById = jest.fn(() => chain(saById));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findById: (...a: unknown[]) => findById(...(a as [])),
    findOne: jest.fn(() => chain(saByUser)),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain(teamAgents)) },
}));

import { getAgentSeekerArea } from "@/lib/auth/agentRestrictions";

const ids = (list: unknown[]) => list.map(String).sort();

beforeEach(() => {
  findById.mockClear();
  saById = { _id: SA_DOC, userId: SA_USER, roleArchivedAt: null };
  saByUser = { _id: SA_DOC, agentIds: [TEAM_AGENT], assignedCityIds: [TIRUR, MALAPPURAM], assignedStateIds: [] };
  teamAgents = [{ _id: TEAM_AGENT, assignedCityIds: [PONNANI], assignedStateIds: [] }];
});

describe("getAgentSeekerArea", () => {
  it("is the agent's own region when they have no super agent", async () => {
    const area = await getAgentSeekerArea({ assignedCityIds: [TIRUR] as never, assignedStateIds: [] });
    expect(ids(area.assignedCityIds)).toEqual([TIRUR]);
    expect(area.assignedStateIds).toEqual([]);
    expect(findById).not.toHaveBeenCalled();
  });

  it("adds the super agent's whole territory, once each", async () => {
    const area = await getAgentSeekerArea({
      assignedCityIds: [TIRUR] as never,
      assignedStateIds: [KERALA] as never,
      superAgentId: SA_DOC,
    });
    // Own Tirur + SA's Tirur/Malappuram + SA team agent's Ponnani; Tirur once.
    expect(ids(area.assignedCityIds)).toEqual([TIRUR, MALAPPURAM, PONNANI].sort());
    expect(ids(area.assignedStateIds)).toEqual([KERALA]);
  });

  it("falls back to the agent's own region when the super agent is gone or archived", async () => {
    saById = null;
    const gone = await getAgentSeekerArea({ assignedCityIds: [TIRUR] as never, assignedStateIds: [], superAgentId: SA_DOC });
    expect(ids(gone.assignedCityIds)).toEqual([TIRUR]);

    saById = { _id: SA_DOC, userId: SA_USER, roleArchivedAt: new Date() };
    const archived = await getAgentSeekerArea({ assignedCityIds: [TIRUR] as never, assignedStateIds: [], superAgentId: SA_DOC });
    expect(ids(archived.assignedCityIds)).toEqual([TIRUR]);
  });

  it("gives an agent with no region of their own their super agent's region", async () => {
    const area = await getAgentSeekerArea({ assignedCityIds: [], assignedStateIds: [], superAgentId: SA_DOC });
    expect(ids(area.assignedCityIds)).toEqual([TIRUR, MALAPPURAM, PONNANI].sort());
  });
});
