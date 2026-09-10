/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const EMPLOYER_A = "64c000000000000000000001";
const EMPLOYER_B = "64c000000000000000000002";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
}));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["select", "sort", "skip", "limit"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

const jobAggregate = jest.fn(async (..._args: unknown[]) => [
  { _id: EMPLOYER_A, count: 6 },
  { _id: EMPLOYER_B, count: 2 },
]);
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { aggregate: (...a: unknown[]) => jobAggregate(...a) },
}));

const employerFind = jest.fn((..._args: unknown[]) =>
  chain([{ _id: EMPLOYER_A, companyName: "Beta Industries", industry: "Finance" }]),
);
const employerCount = jest.fn(async (..._args: unknown[]) => 1);
const employerDistinct = jest.fn(async (..._args: unknown[]) => [
  "Finance",
  "Media",
  "  ",
  null,
  "Manufacturing",
]);
const employerModel = {
  find: (...a: unknown[]) => employerFind(...a),
  countDocuments: (...a: unknown[]) => employerCount(...a),
  distinct: (...a: unknown[]) => employerDistinct(...a),
};
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: employerModel,
  Employer: employerModel,
}));

 
const { GET } = require("@/app/api/companies/route") as typeof import("@/app/api/companies/route");

function request(query: string) {
  return new NextRequest(`http://localhost/api/companies${query}`);
}

/** The filter object the route handed to Employer.find on the last call. */
function lastFilter(): Record<string, unknown> {
  return (employerFind.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  employerFind.mockClear();
  employerCount.mockClear();
  employerDistinct.mockClear();
  jobAggregate.mockClear();
});

describe("GET /api/companies", () => {
  it("applies the industry filter to the query", async () => {
    // Regression: the route used to read `search` only, so ?industry=Finance
    // returned every hiring company and the seeker's dropdown did nothing.
    await GET(request("?industry=Finance"));

    expect(lastFilter().industry).toEqual({ $regex: "^Finance$", $options: "i" });
  });

  it("anchors the industry regex so one industry cannot match another", async () => {
    await GET(request("?industry=Media"));

    const { $regex } = lastFilter().industry as { $regex: string };
    expect(new RegExp($regex, "i").test("Social Media Marketing")).toBe(false);
    expect(new RegExp($regex, "i").test("Media")).toBe(true);
  });

  it("treats the 'all' sentinel as no industry constraint", async () => {
    await GET(request("?industry=all"));

    expect(lastFilter()).not.toHaveProperty("industry");
  });

  it("combines search and industry rather than replacing one with the other", async () => {
    await GET(request("?search=beta&industry=Finance"));

    const filter = lastFilter();
    expect(filter.$or).toHaveLength(3);
    expect(filter.industry).toEqual({ $regex: "^Finance$", $options: "i" });
  });

  it("returns the industry facet for every hiring employer, not just this page", async () => {
    const res = await GET(request("?page=1&limit=1"));
    const body = await res.json();

    // One company on the page, three usable industries across the directory.
    expect(body.items).toHaveLength(1);
    expect(body.industries).toEqual(["Finance", "Manufacturing", "Media"]);
    // Blank and null industries must not become dropdown options.
    expect(employerDistinct).toHaveBeenCalledWith("industry", expect.any(Object));
  });

  it("excludes expired jobs from the open-job count so cards match the profile", async () => {
    await GET(request(""));

    const pipeline = (jobAggregate.mock.calls.at(-1)?.[0] ?? []) as Array<{ $match?: Record<string, unknown> }>;
    const match = pipeline[0]?.$match ?? {};
    expect(match.status).toBe("active");
    expect(match.$or).toEqual([
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gte: expect.any(Date) } },
    ]);
  });

  it("reports the open-job count alongside each company", async () => {
    const res = await GET(request(""));
    const body = await res.json();

    expect(body.items[0]).toMatchObject({ companyName: "Beta Industries", activeJobCount: 6 });
  });
});
