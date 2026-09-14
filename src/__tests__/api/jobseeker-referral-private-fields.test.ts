/**
 * @jest-environment node
 */
/**
 * An employer learns that a candidate was referred, never by whom. Every
 * employer-facing read uses an explicit select list; this pins that none of
 * them ever asks for `referral`, and that the boolean is what reaches the page.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) =>
    async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) =>
      handler(req, { userId: "emp_user_1", role: "employer", locale: "en" }, await ctx.params),
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

const selects: string[] = [];
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "populate"]) c[m] = jest.fn(() => c);
  c.select = jest.fn((s: string) => { selects.push(String(s)); return c; });
  c.lean = jest.fn(async () => result);
  return c;
}
const SEEKER = {
  _id: "64f000000000000000000001",
  fullName: "Sara Ali",
  isAgentReferred: true,
  referral: { agentId: "64f000000000000000000099", code: "MPL-SECRET" },
  userId: { _id: "u1", name: "Sara Ali" },
};
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => chain([SEEKER])),
    countDocuments: jest.fn(async () => 1),
  },
}));

describe("talent search never ships referral details to employers", () => {
  it("selects isAgentReferred and not referral, and the row carries only the boolean", async () => {
    const { GET } = await import("@/app/api/employer/talent-search/route");
    const res = await GET(new NextRequest("http://localhost:3888/api/employer/talent-search"), {
      params: Promise.resolve({}),
    });
    const body = await res.json();
    expect(selects.some((s) => /\bisAgentReferred\b/.test(s))).toBe(true);
    expect(selects.some((s) => /\breferral\b/.test(s))).toBe(false);
    expect(body.items[0].isAgentReferred).toBe(true);
    expect(JSON.stringify(body)).not.toContain("MPL-SECRET");
    expect(body.items[0].referral).toBeUndefined();
  });
});

describe("select lists on the other employer reads", () => {
  it.each([
    "src/app/api/employers/candidates/[id]/route.ts",
    "src/app/api/applications/handlers.ts",
    "src/app/api/applications/[id]/route.ts",
    "src/app/api/applications/compare/route.ts",
  ])("%s never names the referral sub-document in a projection", (file) => {
    const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(src).not.toMatch(/select\([^)]*\breferral\b/);
    expect(src).not.toMatch(/select:\s*"[^"]*\breferral\b/);
  });
});
