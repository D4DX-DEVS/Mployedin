/**
 * @jest-environment node
 *
 * The seeker area picker lists a country's regions by its ISO code, for a
 * seeker whose city isn't in the list (owner, 2026-10-02).
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true, resetAt: 0 })) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn() } }));

const COUNTRY = "64b0000000000000000000f1";
let country: unknown;
const countryFindOne = jest.fn();
const stateFind = jest.fn();
jest.mock("@/models/Country", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn((f: unknown) => {
      countryFindOne(f);
      return { select: () => ({ lean: async () => country }) };
    }),
  },
}));
jest.mock("@/models/State", () => ({
  __esModule: true,
  default: {
    find: jest.fn((f: unknown) => {
      stateFind(f);
      return { sort: () => ({ select: () => ({ lean: async () => [{ _id: "s1", name: "Kerala" }] }) }) };
    }),
  },
}));
jest.mock("@/models/City", () => ({ __esModule: true, default: {} }));

import { GET } from "@/app/api/filters/locations/route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/filters/locations?${qs}`));

beforeEach(() => {
  jest.clearAllMocks();
  country = { _id: COUNTRY };
});

it("lists a country's active regions by ISO code", async () => {
  const res = await get("level=states&country=in");
  expect(res.status).toBe(200);
  expect((await res.json()).states).toEqual([{ _id: "s1", name: "Kerala" }]);
  expect(countryFindOne).toHaveBeenCalledWith({ code: "IN" });
  expect(stateFind).toHaveBeenCalledWith({ countryId: COUNTRY, isActive: true });
});

it("an unknown code lists nothing", async () => {
  country = null;
  expect((await (await get("level=states&country=ZZ")).json()).states).toEqual([]);
  expect(stateFind).not.toHaveBeenCalled();
});

it("still needs a country", async () => {
  expect((await get("level=states")).status).toBe(400);
});
