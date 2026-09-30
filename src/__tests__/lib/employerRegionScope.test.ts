/**
 * @jest-environment node
 */
/**
 * Region-based employer visibility.
 *
 * An employer registered in a city is seen by every super-agent and agent whose
 * territory holds that city or its state — even before any agent is assigned.
 * Before this, a super-agent only saw employers reached through an agent link,
 * so the Dubai super-agent saw none of the 12 companies registered in Dubai.
 */

const DUBAI = "64b0000000000000000000d1";
const DUBAI_STATE = "64b0000000000000000000d2";
const KERALA = "64b0000000000000000000k1";
const SA_PROFILE = "64b0000000000000000000s1";
const AGENT = "64b0000000000000000000a1";
const OUTSIDER = "64b0000000000000000000a2";
const LISTED = "64b0000000000000000000b1";
const IN_DUBAI = "64b0000000000000000000b2";

type Filter = Record<string, unknown>;
const employerFilters: Filter[] = [];
let employerRows: (filter: Filter) => Array<{ _id: string }> = () => [];
const existsFilters: Filter[] = [];
let employerExists: (filter: Filter) => boolean = () => false;
let saDoc: Record<string, unknown> | null = null;
let agentDoc: Record<string, unknown> | null = null;
let teamAgentDocs: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    find: jest.fn((filter: Filter) => {
      employerFilters.push(filter);
      return { select: () => ({ lean: async () => employerRows(filter) }) };
    }),
    exists: jest.fn(async (filter: Filter) => {
      existsFilters.push(filter);
      return employerExists(filter) ? { _id: filter._id } : null;
    }),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => saDoc }) })) },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => agentDoc }) })),
    // getSuperAgentScope's region lookup and getSuperAgentBook's team lookup.
    find: jest.fn(() => ({ select: () => ({ lean: async () => teamAgentDocs }) })),
  },
}));

import {
  agentCanSeeEmployer,
  employerRegionMatch,
  getAgentEmployerIds,
  getSuperAgentBook,
  getSuperAgentEmployerIds,
} from "@/lib/auth/agentRestrictions";

const inRegion = (filter: Filter, cityOrState: string) =>
  ((filter.$or as Array<Record<string, { $in: unknown[] }>>) ?? []).some(
    (c) => (c.regionCityId?.$in ?? c.regionStateId?.$in ?? []).map(String).includes(cityOrState),
  );

beforeEach(() => {
  employerFilters.length = 0;
  employerRows = () => [];
  existsFilters.length = 0;
  employerExists = () => false;
  saDoc = null;
  agentDoc = null;
  teamAgentDocs = [];
});

describe("employerRegionMatch", () => {
  it("matches the city itself or the whole state", () => {
    expect(employerRegionMatch({ assignedCityIds: [DUBAI as never], assignedStateIds: [KERALA as never] })).toEqual({
      $or: [{ regionCityId: { $in: [DUBAI] } }, { regionStateId: { $in: [KERALA] } }],
    });
  });

  it("is null for an empty territory — never an unfiltered read", () => {
    expect(employerRegionMatch({ assignedCityIds: [], assignedStateIds: [] })).toBeNull();
  });
});

describe("getSuperAgentBook", () => {
  it("includes employers registered in the SA's territory even with no agent anywhere", async () => {
    saDoc = { _id: SA_PROFILE, agentIds: [], assignedCityIds: [DUBAI], assignedStateIds: [] };
    employerRows = (f) => (inRegion(f, DUBAI) ? [{ _id: "employer-in-dubai" }] : []);

    const book = await getSuperAgentBook("sa-user");

    expect(book?.employerIds.map(String)).toEqual(["employer-in-dubai"]);
    expect(book?.ownershipMatch).toEqual({ $or: [{ employerId: { $in: ["employer-in-dubai"] } }] });
    // The region read skips archived role conversions.
    const regionRead = employerFilters.find((f) => inRegion(f, DUBAI));
    expect(regionRead?.roleArchivedAt).toBeNull();
  });

  it("does not include employers outside the territory", async () => {
    saDoc = { _id: SA_PROFILE, agentIds: [], assignedCityIds: [KERALA], assignedStateIds: [] };
    employerRows = (f) => (inRegion(f, DUBAI) ? [{ _id: "employer-in-dubai" }] : []);

    expect(await getSuperAgentEmployerIds("sa-user")).toEqual([]);
  });

  it("covers its agents' regions too, so the SA always sees what the agents see", async () => {
    saDoc = { _id: SA_PROFILE, agentIds: [AGENT], assignedCityIds: [], assignedStateIds: [] };
    teamAgentDocs = [{ _id: AGENT, assignedEmployerIds: [], assignedCityIds: [], assignedStateIds: [DUBAI_STATE] }];
    employerRows = (f) => (inRegion(f, DUBAI_STATE) ? [{ _id: "employer-in-dubai-state" }] : []);

    const ids = (await getSuperAgentEmployerIds("sa-user")).map(String);
    expect(ids).toContain("employer-in-dubai-state");
  });

  it("a region-overlap agent outside the team lends its employers, not its whole region", async () => {
    saDoc = { _id: SA_PROFILE, agentIds: [], assignedCityIds: [KERALA], assignedStateIds: [] };
    // Returned by getSuperAgentScope's overlap lookup, so it is an effective agent.
    teamAgentDocs = [{ _id: OUTSIDER, assignedEmployerIds: [], assignedCityIds: [KERALA, DUBAI], assignedStateIds: [] }];
    employerRows = (f) => (inRegion(f, DUBAI) ? [{ _id: "employer-in-dubai" }] : []);

    const book = await getSuperAgentBook("sa-user");

    expect(book?.agentIds.map(String)).toContain(OUTSIDER);
    expect(book?.employerIds.map(String)).not.toContain("employer-in-dubai");
  });

  it("keeps the agent links from both ends alongside the region", async () => {
    saDoc = { _id: SA_PROFILE, agentIds: [AGENT], assignedCityIds: [DUBAI], assignedStateIds: [] };
    teamAgentDocs = [{ _id: AGENT, assignedEmployerIds: ["listed-on-agent"], assignedCityIds: [], assignedStateIds: [] }];
    employerRows = (f) =>
      "agentId" in f ? [{ _id: "points-at-agent" }] : inRegion(f, DUBAI) ? [{ _id: "in-dubai" }] : [];

    const ids = (await getSuperAgentEmployerIds("sa-user")).map(String).sort();
    expect(ids).toEqual(["in-dubai", "listed-on-agent", "points-at-agent"]);
  });

  it("matches nothing for an SA with no agents and no territory", async () => {
    saDoc = { _id: SA_PROFILE, agentIds: [], assignedCityIds: [], assignedStateIds: [] };

    const book = await getSuperAgentBook("sa-user");
    expect(book?.employerIds).toEqual([]);
    expect(book?.ownershipMatch).toEqual({ employerId: { $in: [] } });
    expect(employerFilters).toHaveLength(0);
  });
});

describe("getAgentEmployerIds", () => {
  it("is assigned ∪ pointing-at-me ∪ registered in my region", async () => {
    agentDoc = { _id: AGENT, assignedEmployerIds: ["listed"], assignedCityIds: [DUBAI], assignedStateIds: [] };
    employerRows = (f) => (f.agentId ? [{ _id: "points-at-me" }] : inRegion(f, DUBAI) ? [{ _id: "in-dubai" }] : []);

    const ids = (await getAgentEmployerIds("agent-user")).map(String).sort();
    expect(ids).toEqual(["in-dubai", "listed", "points-at-me"]);
  });

  it("sees nothing without an agent profile", async () => {
    agentDoc = null;
    expect(await getAgentEmployerIds("nobody")).toEqual([]);
    expect(await agentCanSeeEmployer("nobody", IN_DUBAI)).toBe(false);
  });

  it("agentCanSeeEmployer answers from the assignment without a query", async () => {
    agentDoc = { _id: AGENT, assignedEmployerIds: [LISTED], assignedCityIds: [DUBAI], assignedStateIds: [] };
    expect(await agentCanSeeEmployer("agent-user", LISTED)).toBe(true);
    expect(existsFilters).toHaveLength(0);
  });

  it("agentCanSeeEmployer checks one employer against pointing-at-me or my region", async () => {
    agentDoc = { _id: AGENT, assignedEmployerIds: [], assignedCityIds: [DUBAI], assignedStateIds: [] };
    employerExists = (f) => f._id === IN_DUBAI;

    expect(await agentCanSeeEmployer("agent-user", IN_DUBAI)).toBe(true);
    expect(existsFilters[0]).toEqual({
      _id: IN_DUBAI,
      $or: [
        { agentId: AGENT },
        { $or: [{ regionCityId: { $in: [DUBAI] } }], roleArchivedAt: null },
      ],
    });
    expect(await agentCanSeeEmployer("agent-user", "64b0000000000000000000b9")).toBe(false);
  });

  it("agentCanSeeEmployer without a region only checks the agent link, and rejects junk ids", async () => {
    agentDoc = { _id: AGENT, assignedEmployerIds: [], assignedCityIds: [], assignedStateIds: [] };
    await agentCanSeeEmployer("agent-user", IN_DUBAI);
    expect(existsFilters[0]).toEqual({ _id: IN_DUBAI, $or: [{ agentId: AGENT }] });
    expect(await agentCanSeeEmployer("agent-user", "in-dubai")).toBe(false);
    expect(existsFilters).toHaveLength(1);
  });

  it("an agent with no region only sees its assigned employers", async () => {
    agentDoc = { _id: AGENT, assignedEmployerIds: ["listed"], assignedCityIds: [], assignedStateIds: [] };
    employerRows = (f) => (f.agentId ? [] : [{ _id: "should-not-appear" }]);

    expect((await getAgentEmployerIds("agent-user")).map(String)).toEqual(["listed"]);
  });
});
