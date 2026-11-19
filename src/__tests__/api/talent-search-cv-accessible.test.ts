/**
 * @jest-environment node
 */
/**
 * A talent row says whether the viewer may open that seeker's CV (`cvAccessible`),
 * so "View CV" is not offered where the CV route would answer "not found":
 * a sourced-only candidate (no application to the employer's jobs, in none of
 * their talent pools) is not openable. The answer comes from ONE batched query
 * for the whole page, by the same predicate as the CV route's gate.
 */
import { NextRequest } from "next/server";

const docs = [
  { _id: "650000000000000000000001", fullName: "Applied", summary: "x", experience: [], skills: [], education: [], cv: { originalUrl: "https://cdn/secret.pdf" } },
  { _id: "650000000000000000000002", fullName: "Pooled", summary: "x", experience: [], skills: [], education: [] },
  { _id: "650000000000000000000003", fullName: "Sourced only", summary: "x", experience: [], skills: [], education: [] },
];

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) => handler(req, (req as unknown as { __ctx: unknown }).__ctx),
}));
const ownershipFind = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: unknown) => ({
      select: (fields: string) => ({
        lean: async () => {
          ownershipFind(filter, fields);
          return docs.map((d) => ({ _id: d._id, agentId: "ag" }));
        },
        populate: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => docs }) }) }) }),
      }),
    })),
    countDocuments: jest.fn(async () => 3),
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

const employerAccessibleSeekerIds = jest.fn();
const resolveCvActor = jest.fn();
jest.mock("@/lib/cv/cvAccess", () => ({
  resolveCvActor: (...a: unknown[]) => resolveCvActor(...a),
  employerAccessibleSeekerIds: (...a: unknown[]) => employerAccessibleSeekerIds(...a),
}));

import { GET as _GET } from "@/app/api/employer/talent-search/route";

const GET = _GET as unknown as (req: NextRequest) => Promise<Response>;

async function rows(ctx: Record<string, unknown> = { userId: "u1", role: "employer", locale: "en" }) {
  const req = new NextRequest("http://localhost:3000/api/employer/talent-search");
  (req as unknown as { __ctx: unknown }).__ctx = ctx;
  const body = await (await GET(req)).json();
  return body.items as Array<Record<string, unknown>>;
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveCvActor.mockResolvedValue({ employerId: "emp1", canViewSeeker: null });
  employerAccessibleSeekerIds.mockResolvedValue(new Set(["650000000000000000000001", "650000000000000000000002"]));
});

describe("GET /api/employer/talent-search cvAccessible (employer)", () => {
  it("is true for an applicant or a pooled candidate, false for a sourced-only one", async () => {
    const items = await rows();
    expect(items.map((i) => i.cvAccessible)).toEqual([true, true, false]);
  });

  it("asks once for the whole page, with the page's seeker ids and the employer's company", async () => {
    await rows();
    expect(employerAccessibleSeekerIds).toHaveBeenCalledTimes(1);
    expect(employerAccessibleSeekerIds).toHaveBeenCalledWith("emp1", [
      "650000000000000000000001",
      "650000000000000000000002",
      "650000000000000000000003",
    ]);
  });

  it("an employer with no company profile gets false everywhere", async () => {
    resolveCvActor.mockResolvedValue({ employerId: null, canViewSeeker: null });
    employerAccessibleSeekerIds.mockResolvedValue(new Set());
    expect((await rows()).map((i) => i.cvAccessible)).toEqual([false, false, false]);
  });

  it("leaks no CV data: no cv path, no profile text, only the yes/no", async () => {
    for (const item of await rows()) {
      expect(item).not.toHaveProperty("cv");
      expect(item).not.toHaveProperty("summary");
      expect(JSON.stringify(item)).not.toContain("secret.pdf");
    }
  });

  it("a colleague without the talent-pool function is never offered a talent-pool CV (the CV route would refuse it)", async () => {
    const items = await rows({
      userId: "u1",
      role: "employer",
      locale: "en",
      member: { permissions: { canReviewApplicants: true, canManageTalentPools: false } },
    });
    expect(items.map((i) => i.cvAccessible)).toEqual([false, false, false]);
  });

  it("a colleague who manages talent pools is treated like the owner", async () => {
    const items = await rows({
      userId: "u1",
      role: "employer",
      locale: "en",
      member: { permissions: { canManageTalentPools: true } },
    });
    expect(items.map((i) => i.cvAccessible)).toEqual([true, true, false]);
  });
});

describe("GET /api/employer/talent-search cvAccessible (other roles)", () => {
  it("admin may open any: true, and no employer lookup", async () => {
    resolveCvActor.mockResolvedValue({ employerId: null, canViewSeeker: null });
    const items = await rows({ userId: "a1", role: "admin", locale: "en" });
    expect(items.map((i) => i.cvAccessible)).toEqual([true, true, true]);
    expect(employerAccessibleSeekerIds).not.toHaveBeenCalled();
  });

  it("an agent: by the same staff scope as the CV route, seeker by seeker", async () => {
    const canViewSeeker = jest.fn(async (s: { _id: unknown }) => s._id === "650000000000000000000002");
    resolveCvActor.mockResolvedValue({ employerId: null, canViewSeeker });
    const items = await rows({ userId: "g1", role: "agent", locale: "en" });
    expect(items.map((i) => i.cvAccessible)).toEqual([false, true, false]);
    expect(employerAccessibleSeekerIds).not.toHaveBeenCalled();
    // One ownership read for the page, and only for staff.
    expect(ownershipFind).toHaveBeenCalledTimes(1);
  });

  it("an employer's page never reads the ownership fields", async () => {
    await rows();
    expect(ownershipFind).not.toHaveBeenCalled();
  });
});
