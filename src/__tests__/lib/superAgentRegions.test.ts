/**
 * @jest-environment node
 */
/**
 * The super agent's region is written from two admin screens (Super Agents and
 * Territories) through one helper. Its agent trim used to be
 * `$pull: { assignedCityIds: { $nin: saCityIds } }`, which dropped an agent's
 * city that sat inside a STATE the super agent held — and with an empty SA
 * city list, every agent city. Overlap detection compared city ids to city ids
 * only, so "Tirur" against another super agent's "Kerala" went unreported.
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const hex = (n: number) => n.toString(16).padStart(24, "0");
const TIRUR = hex(1);
const KOCHI = hex(2);
const DEIRA = hex(3);
const KERALA = hex(10);
const TAMIL_NADU = hex(11);

function lean<T>(value: T) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => value);
  return node;
}

let agents: { _id: string; assignedCityIds: string[]; assignedStateIds: string[] }[] = [];
let otherSuperAgents: { userId: string; assignedCityIds: string[]; assignedStateIds: string[] }[] = [];
const agentUpdateOne = jest.fn(async () => ({}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => lean(agents)),
    updateOne: (...args: unknown[]) => agentUpdateOne(...(args as [])),
  },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => lean(otherSuperAgents)) },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => lean([{ _id: "u_rajesh", name: "Rajesh" }])) },
}));
jest.mock("@/models/City", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() =>
      lean([
        { _id: TIRUR, stateId: KERALA },
        { _id: KOCHI, stateId: KERALA },
        { _id: DEIRA, stateId: hex(99) },
      ])),
  },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  // Kerala expands to its two cities.
  expandStatesToCities: jest.fn(async (region: { assignedCityIds: unknown[]; assignedStateIds: unknown[] }) => {
    const set = new Set(region.assignedCityIds.map(String));
    if (region.assignedStateIds.map(String).includes(KERALA)) { set.add(TIRUR); set.add(KOCHI); }
    return set;
  }),
}));

import { findRegionOverlaps, trimAgentsToRegion } from "@/lib/superAgent/regions";

beforeEach(() => {
  jest.clearAllMocks();
  agents = [];
  otherSuperAgents = [];
});

describe("trimAgentsToRegion", () => {
  it("keeps an agent city that sits inside a state the super agent holds", async () => {
    agents = [{ _id: "a1", assignedCityIds: [TIRUR], assignedStateIds: [] }];
    await expect(trimAgentsToRegion("sap", { cityIds: [], stateIds: [KERALA] })).resolves.toBe(0);
    expect(agentUpdateOne).not.toHaveBeenCalled();
  });

  it("pulls only the places outside the region", async () => {
    agents = [
      { _id: "a1", assignedCityIds: [TIRUR, DEIRA], assignedStateIds: [KERALA, TAMIL_NADU] },
      { _id: "a2", assignedCityIds: [KOCHI], assignedStateIds: [] },
    ];
    await expect(trimAgentsToRegion("sap", { cityIds: [], stateIds: [KERALA] })).resolves.toBe(1);
    expect(agentUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = agentUpdateOne.mock.calls[0] as unknown as [
      { _id: string },
      { $pull: { assignedCityIds: { $in: unknown[] }; assignedStateIds: { $in: unknown[] } } },
    ];
    expect(filter).toEqual({ _id: "a1" });
    expect(update.$pull.assignedCityIds.$in.map(String)).toEqual([DEIRA]);
    expect(update.$pull.assignedStateIds.$in.map(String)).toEqual([TAMIL_NADU]);
  });
});

describe("findRegionOverlaps", () => {
  it("reports a city that sits inside another super agent's state", async () => {
    otherSuperAgents = [{ userId: "u_rajesh", assignedCityIds: [], assignedStateIds: [KERALA] }];
    await expect(findRegionOverlaps("u_me", { cityIds: [TIRUR], stateIds: [] })).resolves.toEqual([
      { superAgentName: "Rajesh", overlappingCities: 1, overlappingStates: 0 },
    ]);
  });

  it("reports nothing when the regions are apart", async () => {
    otherSuperAgents = [{ userId: "u_rajesh", assignedCityIds: [DEIRA], assignedStateIds: [] }];
    await expect(findRegionOverlaps("u_me", { cityIds: [TIRUR], stateIds: [] })).resolves.toEqual([]);
  });
});
