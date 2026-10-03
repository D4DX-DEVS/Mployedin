/**
 * @jest-environment node
 *
 * A job seeker's area is a catalogue city, or just the region (state) when
 * their town isn't listed (owner, 2026-10-02). Only active catalogue entries
 * resolve; anything else is null so the route refuses it before writing.
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const CITY = "64b0000000000000000000c1";
const STATE = "64b0000000000000000000e1";
const COUNTRY = "64b0000000000000000000f1";

let city: unknown;
let state: unknown;
const stateFindOne = jest.fn();
const lean = (v: () => unknown) => ({ lean: async () => v() });
jest.mock("@/models/City", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => lean(() => city) })) },
}));
jest.mock("@/models/State", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn((filter: unknown) => {
      stateFindOne(filter);
      return { select: () => lean(() => state) };
    }),
  },
}));
jest.mock("@/models/Country", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ select: () => lean(() => ({ _id: COUNTRY, code: "in" })) })) },
}));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

import { resolveSeekerArea } from "@/lib/agents/territoryCoverage";

beforeEach(() => {
  stateFindOne.mockClear();
  city = { _id: CITY, name: "Tirur", stateId: STATE };
  state = { _id: STATE, name: "Kerala", countryId: COUNTRY };
});

it("a city brings its region and country", async () => {
  expect(await resolveSeekerArea({ cityId: CITY })).toEqual({
    cityId: CITY, cityName: "Tirur", stateId: STATE, stateName: "Kerala", countryCode: "IN",
  });
});

it("a region on its own has no city", async () => {
  expect(await resolveSeekerArea({ stateId: STATE })).toEqual({
    cityId: null, cityName: null, stateId: STATE, stateName: "Kerala", countryCode: "IN",
  });
  expect(stateFindOne).toHaveBeenCalledWith({ _id: STATE, isActive: true });
});

it("an unknown or inactive pick resolves to nothing", async () => {
  city = null;
  expect(await resolveSeekerArea({ cityId: CITY })).toBeNull();
  state = null;
  expect(await resolveSeekerArea({ stateId: STATE })).toBeNull();
  expect(await resolveSeekerArea({ stateId: "not-an-id" })).toBeNull();
  expect(await resolveSeekerArea({})).toBeNull();
});
