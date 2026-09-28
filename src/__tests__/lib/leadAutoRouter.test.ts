/**
 * @jest-environment node
 */
/**
 * Lead auto-routing reads the super agents' real regions (SuperAgent
 * assignedCityIds / assignedStateIds) — the regions that scope every
 * super-agent screen — and writes the SuperAgent PROFILE id, which is what
 * Lead.superAgentId references. It used to match a hardcoded country list on
 * the Territory collection and write a User id, so routed leads never reached
 * the super agent.
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

function lean<T>(value: T) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => value);
  return node;
}

const COUNTRIES: Record<string, string> = { IN: "co_in", AE: "co_ae" };
const STATES = [
  { _id: "s_kerala", countryId: "co_in" },
  { _id: "s_dubai", countryId: "co_ae" },
];
const CITIES = [
  { _id: "c_tirur", name: "Tirur", stateId: "s_kerala" },
  { _id: "c_kochi", name: "Kochi", stateId: "s_kerala" },
  { _id: "c_deira", name: "Deira", stateId: "s_dubai" },
];

let superAgents: { _id: string; userId: string; assignedCityIds: string[]; assignedStateIds: string[] }[] = [];
let activeUsers: string[] = [];
const territoryFindOne = jest.fn();

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => lean(superAgents)) },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: { _id: { $in: string[] } }) =>
      lean(filter._id.$in.filter((id) => activeUsers.includes(id)).map((_id) => ({ _id })))),
  },
}));
jest.mock("@/models/Country", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn((filter: { code?: string }) =>
      lean(filter.code && COUNTRIES[filter.code] ? { _id: COUNTRIES[filter.code] } : null)),
  },
}));
jest.mock("@/models/State", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: { countryId: string }) => lean(STATES.filter((s) => s.countryId === filter.countryId))),
  },
}));
jest.mock("@/models/City", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: { name?: RegExp; stateId?: { $in: string[] }; _id?: { $in: string[] } }) =>
      lean(
        CITIES.filter(
          (c) =>
            (!filter.name || filter.name.test(c.name)) &&
            (!filter.stateId || filter.stateId.$in.includes(c.stateId)) &&
            (!filter._id || filter._id.$in.includes(c._id)),
        ),
      )),
  },
}));
jest.mock("@/models/Territory", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => territoryFindOne(...args) },
}));

import { autoRouteLead, findTerritoryForLead } from "@/lib/leads/autoRouter";

const TIRUR_SA = { _id: "sap_tirur", userId: "u_tirur", assignedCityIds: ["c_tirur"], assignedStateIds: [] };
const KERALA_SA_1 = { _id: "sap_k1", userId: "u_k1", assignedCityIds: [], assignedStateIds: ["s_kerala"] };
const KERALA_SA_2 = { _id: "sap_k2", userId: "u_k2", assignedCityIds: [], assignedStateIds: ["s_kerala"] };
const DUBAI_SA = { _id: "sap_dubai", userId: "u_dubai", assignedCityIds: [], assignedStateIds: ["s_dubai"] };

beforeEach(() => {
  jest.clearAllMocks();
  superAgents = [TIRUR_SA, KERALA_SA_1, KERALA_SA_2, DUBAI_SA];
  activeUsers = superAgents.map((sa) => sa.userId);
  territoryFindOne.mockImplementation((filter: { superAgentId: string }) =>
    lean(filter.superAgentId === "u_tirur" ? { _id: "t_india", name: "india" } : null));
});

describe("findTerritoryForLead", () => {
  it("routes a city to the super agent holding that city, by SuperAgent profile id", async () => {
    await expect(findTerritoryForLead("India", " tirur ")).resolves.toEqual({
      superAgentId: "sap_tirur",
      territoryId: "t_india",
      territoryName: "india",
    });
  });

  it("prefers the city holder over super agents holding its state", async () => {
    const route = await findTerritoryForLead(undefined, "Tirur");
    expect(route?.superAgentId).toBe("sap_tirur");
  });

  it("does not guess between two super agents holding the same state", async () => {
    await expect(findTerritoryForLead("India", "Kochi")).resolves.toBeNull();
  });

  it("routes by state when exactly one super agent holds it", async () => {
    superAgents = [TIRUR_SA, KERALA_SA_1];
    const route = await findTerritoryForLead("India", "Kochi");
    expect(route).toEqual({ superAgentId: "sap_k1", territoryId: null, territoryName: null });
  });

  it("routes a country-only lead when one super agent covers that country, reading codes and aliases", async () => {
    await expect(findTerritoryForLead("UAE")).resolves.toMatchObject({ superAgentId: "sap_dubai" });
    await expect(findTerritoryForLead("AE")).resolves.toMatchObject({ superAgentId: "sap_dubai" });
  });

  it("skips super agents whose account is inactive", async () => {
    activeUsers = ["u_k1", "u_k2", "u_dubai"];
    await expect(findTerritoryForLead("India", "Tirur")).resolves.toBeNull();
  });

  it("returns nothing for an unknown place or an empty location", async () => {
    await expect(findTerritoryForLead("Atlantis")).resolves.toBeNull();
    await expect(findTerritoryForLead(undefined, undefined)).resolves.toBeNull();
  });
});

describe("autoRouteLead", () => {
  it("leaves a lead that already has a super agent alone", async () => {
    await expect(autoRouteLead({ country: "India", city: "Tirur", superAgentId: "sap_manual" as never })).resolves.toBeNull();
  });
});
