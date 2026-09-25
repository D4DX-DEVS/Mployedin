/**
 * @jest-environment node
 */
/**
 * resolveAssignedRegions — turns the admin-assigned city/state ids on an Agent
 * or SuperAgent into the names the dashboard hero and profile show
 * ("Tirur, Kerala, India"). Only ids live on the profile, so without this walk
 * the screens had nothing to print.
 */
import { regionLocale, resolveAssignedRegions } from "@/lib/agents/assignedRegion";

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const CITIES = [
  { _id: "c_tirur", name: "Tirur", nameAr: "تيرور", stateId: "st_kerala" },
  { _id: "c_orphan", name: "Orphan", nameAr: "", stateId: "st_missing" },
];
const STATES = [
  { _id: "st_kerala", name: "Kerala", nameAr: "", countryId: "co_in" },
  { _id: "st_dubai", name: "Dubai", nameAr: "دبي", countryId: "co_ae" },
];
const COUNTRIES = [
  { _id: "co_in", name: "India", nameAr: "الهند" },
  { _id: "co_ae", name: "United Arab Emirates", nameAr: "الإمارات" },
];

const byIds = <T extends { _id: string }>(rows: T[], filter: { _id: { $in: string[] } }) =>
  rows.filter((r) => filter._id.$in.includes(r._id));

const cityFind = jest.fn((filter: { _id: { $in: string[] } }) => chain(byIds(CITIES, filter)));
const stateFind = jest.fn((filter: { _id: { $in: string[] } }) => chain(byIds(STATES, filter)));
const countryFind = jest.fn((filter: { _id: { $in: string[] } }) => chain(byIds(COUNTRIES, filter)));

jest.mock("@/models/City", () => ({ __esModule: true, default: { find: (f: never) => cityFind(f) } }));
jest.mock("@/models/State", () => ({ __esModule: true, default: { find: (f: never) => stateFind(f) } }));
jest.mock("@/models/Country", () => ({ __esModule: true, default: { find: (f: never) => countryFind(f) } }));

describe("resolveAssignedRegions", () => {
  beforeEach(() => {
    cityFind.mockClear();
    stateFind.mockClear();
    countryFind.mockClear();
  });

  it("names a city with its state and country — the seeded agent's Tirur", async () => {
    const regions = await resolveAssignedRegions({ assignedCityIds: ["c_tirur"], assignedStateIds: [] }, "en");
    expect(regions).toEqual([{ id: "c_tirur", type: "city", name: "Tirur", parent: "Kerala, India" }]);
    // The city's parent state is fetched for its label even though it was not assigned.
    expect(stateFind).toHaveBeenCalledWith({ _id: { $in: ["st_kerala"] } });
  });

  it("lists assigned states before cities, a state's parent being its country", async () => {
    const regions = await resolveAssignedRegions(
      { assignedCityIds: ["c_tirur"], assignedStateIds: ["st_dubai"] },
      "en",
    );
    expect(regions.map((r) => [r.type, r.name, r.parent])).toEqual([
      ["state", "Dubai", "United Arab Emirates"],
      ["city", "Tirur", "Kerala, India"],
    ]);
  });

  it("uses Arabic names in ar, falling back to English where none is stored", async () => {
    const regions = await resolveAssignedRegions(
      { assignedCityIds: ["c_tirur"], assignedStateIds: ["st_dubai"] },
      "ar",
    );
    expect(regions.map((r) => `${r.name} | ${r.parent}`)).toEqual([
      "دبي | الإمارات",
      // Kerala has no nameAr → English, India has one → Arabic.
      "تيرور | Kerala, الهند",
    ]);
  });

  it("drops ids that no longer resolve and never queries for an empty region", async () => {
    expect(await resolveAssignedRegions({ assignedCityIds: ["c_gone"], assignedStateIds: ["st_gone"] }, "en")).toEqual([]);

    // A city whose state was deleted still shows, just without a parent chain.
    expect(await resolveAssignedRegions({ assignedCityIds: ["c_orphan"] }, "en")).toEqual([
      { id: "c_orphan", type: "city", name: "Orphan", parent: "" },
    ]);

    cityFind.mockClear();
    stateFind.mockClear();
    expect(await resolveAssignedRegions(null, "en")).toEqual([]);
    expect(await resolveAssignedRegions({ assignedCityIds: [], assignedStateIds: [] }, "en")).toEqual([]);
    expect(cityFind).not.toHaveBeenCalled();
    expect(stateFind).not.toHaveBeenCalled();
  });
});

describe("regionLocale", () => {
  it("prefers the page's locale, falling back to the saved one for anything we do not ship", () => {
    expect(regionLocale("ar", "en")).toBe("ar");
    expect(regionLocale("en", "ar")).toBe("en");
    expect(regionLocale("fr", "ar")).toBe("ar");
    expect(regionLocale(null, "en")).toBe("en");
  });
});
