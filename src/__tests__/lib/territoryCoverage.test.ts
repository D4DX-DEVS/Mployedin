/**
 * @jest-environment node
 */
/**
 * Region resolution and coverage.
 *
 * - A signup city resolves to exactly one catalogue city, or to nothing — an
 *   ambiguous or unknown typed name must never be guessed into a region.
 * - Coverage returns EVERY super-agent covering a region (territories may
 *   overlap on purpose), and never an archived one. A super-agent's territory
 *   includes their team's regions — the same territory getSuperAgentBook reads.
 * - The admin overlap check finds city-in-state overlaps in both directions.
 */

const CITY = "64b0000000000000000000c1";
const STATE = "64b0000000000000000000e1";
const COUNTRY = "64b0000000000000000000f1";

let cityFindOne: unknown = null;
let cityFindRows: unknown[] = [];
const cityDistinct = jest.fn();
let superAgentRows: unknown[] = [];
const superAgentFind = jest.fn();
let userRows: unknown[] = [];
let teamAgentRows: unknown[] = [];
let regionAgentRows: unknown[] = [];
const agentFind = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const lean = (v: () => unknown) => ({ lean: async () => v() });
jest.mock("@/models/City", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => lean(() => cityFindOne) })),
    findById: jest.fn(() => ({ select: () => lean(() => cityFindOne) })),
    find: jest.fn((filter: Record<string, unknown>) => ({
      select: () => ({ limit: () => lean(() => cityFindRows), sort: () => ({ limit: () => lean(() => cityFindRows) }) }),
      distinct: (field: string) => cityDistinct(field, filter),
    })),
  },
}));
jest.mock("@/models/State", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: () => lean(() => ({ _id: STATE, countryId: COUNTRY })) })),
    find: jest.fn(() => ({ select: () => lean(() => [{ _id: STATE }]) })),
  },
}));
jest.mock("@/models/Country", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: () => lean(() => ({ _id: COUNTRY, code: "ae" })) })),
    findOne: jest.fn(() => ({ select: () => lean(() => ({ _id: COUNTRY })) })),
  },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: unknown) => {
      superAgentFind(filter);
      return { select: () => lean(() => superAgentRows) };
    }),
    distinct: jest.fn(),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    // By _id = a super-agent's team; by territory = agents covering a region.
    find: jest.fn((filter: Record<string, unknown>) => {
      agentFind(filter);
      return { select: () => lean(() => ("_id" in filter ? teamAgentRows : regionAgentRows)) };
    }),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: () => lean(() => userRows) })) },
}));

import {
  employerCoverageFilter,
  findRegionCoverage,
  findTerritoryOverlaps,
  resolveEmployerRegion,
} from "@/lib/agents/territoryCoverage";

beforeEach(() => {
  cityFindOne = null;
  cityFindRows = [];
  superAgentRows = [];
  userRows = [];
  teamAgentRows = [];
  regionAgentRows = [];
  jest.clearAllMocks();
});

describe("resolveEmployerRegion", () => {
  it("resolves a picked city id to city, state and ISO country", async () => {
    cityFindOne = { _id: CITY, name: "Dubai", stateId: STATE };
    await expect(resolveEmployerRegion({ cityId: CITY })).resolves.toEqual({
      cityId: CITY, stateId: STATE, cityName: "Dubai", countryCode: "AE",
    });
  });

  it("returns nothing for an unknown city id", async () => {
    cityFindOne = null;
    await expect(resolveEmployerRegion({ cityId: CITY })).resolves.toBeNull();
  });

  it("resolves a typed name only when exactly one city in the country has it", async () => {
    cityFindRows = [{ _id: CITY, name: "Dubai", stateId: STATE }];
    await expect(resolveEmployerRegion({ cityName: "dubai", countryCode: "AE" })).resolves.toMatchObject({ cityId: CITY });
  });

  it("refuses to guess between two cities of the same name", async () => {
    cityFindRows = [
      { _id: CITY, name: "Springfield", stateId: STATE },
      { _id: "64b0000000000000000000c2", name: "Springfield", stateId: STATE },
    ];
    await expect(resolveEmployerRegion({ cityName: "Springfield", countryCode: "US" })).resolves.toBeNull();
  });
});

describe("findRegionCoverage", () => {
  it("returns every live super-agent covering the city or its state", async () => {
    superAgentRows = [
      { _id: "p1", userId: "u1", assignedCityIds: [CITY], assignedStateIds: [] },
      { _id: "p2", userId: "u2", assignedCityIds: [], assignedStateIds: [STATE] },
      { _id: "p3", userId: "u3", assignedCityIds: ["64b0000000000000000000c9"], assignedStateIds: [] },
    ];
    userRows = [{ _id: "u1", name: "City SA" }, { _id: "u2", name: "State SA" }, { _id: "u3", name: "Elsewhere" }];

    const coverage = await findRegionCoverage({ cityId: CITY, stateId: STATE });

    expect(superAgentFind).toHaveBeenCalledWith({ roleArchivedAt: null });
    expect(coverage.superAgents).toEqual([
      expect.objectContaining({ userId: "u1", name: "City SA", via: "city" }),
      expect.objectContaining({ userId: "u2", name: "State SA", via: "state" }),
    ]);
  });

  it("counts a super-agent whose team agent covers the region — the SA's book sees it too", async () => {
    superAgentRows = [{ _id: "p1", userId: "u1", agentIds: ["a1"], assignedCityIds: [], assignedStateIds: [] }];
    teamAgentRows = [{ _id: "a1", assignedCityIds: [CITY], assignedStateIds: [] }];
    userRows = [{ _id: "u1", name: "Team SA" }];

    const coverage = await findRegionCoverage({ cityId: CITY, stateId: STATE });

    expect(coverage.superAgents).toEqual([expect.objectContaining({ userId: "u1", via: "city" })]);
    // Archived team agents lend no territory.
    expect(agentFind).toHaveBeenCalledWith({ _id: { $in: ["a1"] }, roleArchivedAt: null });
  });

  it("drops a super-agent whose user account is deactivated", async () => {
    superAgentRows = [{ _id: "p1", userId: "u1", assignedCityIds: [CITY] }];
    userRows = [];
    expect((await findRegionCoverage({ cityId: CITY, stateId: STATE })).superAgents).toEqual([]);
  });
});

describe("employerCoverageFilter", () => {
  it("treats a region covered only through a team agent as covered", async () => {
    superAgentRows = [{ _id: "p1", userId: "u1", agentIds: ["a1"], assignedCityIds: [], assignedStateIds: [STATE] }];
    teamAgentRows = [{ _id: "a1", assignedCityIds: [CITY], assignedStateIds: [] }];

    const none = (await employerCoverageFilter(false)) as { $nor: Array<Record<string, { $in: unknown[] }>> };

    expect(none.$nor[0].regionCityId.$in.map(String)).toEqual([CITY]);
    expect(none.$nor[1].regionStateId.$in.map(String)).toEqual([STATE]);
    expect(await employerCoverageFilter(true)).toEqual({ $or: none.$nor });
  });
});

describe("findTerritoryOverlaps", () => {
  it("checks shared cities, shared states, and cities inside a proposed state (both ways)", async () => {
    cityDistinct.mockImplementation(async (field: string) => (field === "stateId" ? [STATE] : ["child-city"]));
    superAgentRows = [];

    await findTerritoryOverlaps({ role: "super_agent", cityIds: [CITY], stateIds: [STATE], excludeUserId: null });

    const filter = superAgentFind.mock.calls[0][0] as { $or: unknown[]; roleArchivedAt: null };
    expect(filter.roleArchivedAt).toBeNull();
    expect(filter.$or).toEqual([
      { assignedCityIds: { $in: [CITY] } },
      { assignedStateIds: { $in: [STATE] } },
      { assignedStateIds: { $in: [STATE] } },
      { assignedCityIds: { $in: ["child-city"] } },
    ]);
  });

  it("does nothing for an empty proposal", async () => {
    await expect(findTerritoryOverlaps({ role: "agent", cityIds: [], stateIds: [] })).resolves.toEqual([]);
    expect(superAgentFind).not.toHaveBeenCalled();
  });
});
