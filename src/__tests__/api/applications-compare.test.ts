/**
 * @jest-environment node
 *
 * GET /api/applications/compare — the finalist comparison. Nothing called it
 * until the compare dialog shipped, which is how every column came back as
 * "Unknown": the route selected a `name` field job seekers do not have.
 */
import { NextRequest } from "next/server";

const EMPLOYER_ID = "64b000000000000000000002";
const APP_A = "64b000000000000000000031";
const APP_B = "64b000000000000000000032";

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: string; locale: string }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: "64b000000000000000000001", role: "employer", locale: "en" }),
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOne: jest.fn(() => chain({ _id: "64b000000000000000000002" })) },
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: {} }));

const applications = [
  {
    _id: APP_A, status: "shortlisted", appliedAt: new Date("2026-09-01"), employerId: EMPLOYER_ID, aiMatchScore: 88,
    matchBreakdown: { skills: 90, experience: 80 },
    jobSeekerId: { fullName: "Amal Haddad", userId: { name: "amal (account)", avatar: null }, skills: ["React", "Node.js"], experience: [{ startDate: new Date("2022-01-01") }], preferredSalary: null, profileCompleteness: 80 },
    jobId: { title: "Full Stack Developer", salaryRange: null },
  },
  {
    _id: APP_B, status: "shortlisted", appliedAt: new Date("2026-09-02"), employerId: EMPLOYER_ID, aiMatchScore: 74,
    matchBreakdown: null,
    jobSeekerId: { fullName: undefined, userId: { name: "Bilal Khan", avatar: "https://cdn/bilal.png" }, skills: ["react", "Go"], experience: [], preferredSalary: { min: 1, max: 2, currency: "AED" }, profileCompleteness: 55 },
    jobId: { title: "Full Stack Developer", salaryRange: null },
  },
];

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain(applications)) },
}));

async function get(query: string) {
  const { GET } = await import("@/app/api/applications/compare/route");
  const res = await GET(new NextRequest(`http://localhost/api/applications/compare${query}`), { params: Promise.resolve({}) } as never);
  return { status: res.status, body: await res.json() };
}

describe("GET /api/applications/compare", () => {
  it("names each finalist from the seeker's fullName, falling back to the account name", async () => {
    const { status, body } = await get(`?ids=${APP_A},${APP_B}`);
    expect(status).toBe(200);
    expect(body.candidates.map((c: { candidate: { name: string } }) => c.candidate.name)).toEqual(["Amal Haddad", "Bilal Khan"]);
    expect(body.candidates[1].candidate.profilePicture).toBe("https://cdn/bilal.png");
    expect(body.commonSkills).toEqual(["react"]);

    const Application = (await import("@/models/Application")).default as unknown as { find: jest.Mock };
    const populateArg = Application.find.mock.results[0].value.populate.mock.calls[0][0];
    expect(populateArg).toMatchObject({ path: "jobSeekerId", populate: { path: "userId" } });
    expect(populateArg.select).toContain("fullName");
    expect(populateArg.select).not.toMatch(/\bname\b/);
  });

  it("rejects fewer than two ids", async () => {
    const { status } = await get(`?ids=${APP_A}`);
    expect(status).toBe(400);
  });
});
