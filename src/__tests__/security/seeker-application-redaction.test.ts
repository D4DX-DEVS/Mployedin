/**
 * @jest-environment node
 *
 * 2026-09-28 OWASP assessment H-02: GET /api/applications as a job seeker
 * returned the recruiters' internal notes thread, behaviour scores and staff
 * status-history notes (bulk reject writes the rejection reason there). The
 * same handler backs the MCP list_my_applications tool.
 */
import { NextRequest } from "next/server";
import {
  SEEKER_APPLICATION_PROJECTION,
  SEEKER_HIDDEN_APPLICATION_FIELDS,
  redactApplicationForSeeker,
} from "@/lib/applications/seekerView";

const SEEKER_USER = "64b0000000000000000000a1";
const EMPLOYER_USER = "64b0000000000000000000e1";

const leakyApplication = {
  _id: "64b0000000000000000000ff",
  status: "rejected",
  jobSeekerId: { _id: "64b0000000000000000000b1" },
  seekerMatchScore: 71,
  aiMatchScore: 55,
  notes: [{ authorId: EMPLOYER_USER, authorName: "Employer", content: "internal: weak communicator" }],
  employerNotes: "do not rehire",
  agentNotes: "agent private",
  matchNotes: "llm narrative",
  behaviorSignals: { responsiveness: 0.2 },
  behaviorScore: 12,
  rejectionReason: "culture fit",
  statusHistory: [
    { status: "applied", changedAt: "2026-09-01", changedBy: SEEKER_USER, note: "Application submitted" },
    { status: "rejected", changedAt: "2026-09-02", changedBy: EMPLOYER_USER, note: "culture fit" },
  ],
};

describe("redactApplicationForSeeker", () => {
  it("drops every recruiter-internal field", () => {
    const out = redactApplicationForSeeker(leakyApplication, SEEKER_USER);
    for (const key of SEEKER_HIDDEN_APPLICATION_FIELDS) expect(out).not.toHaveProperty(key);
  });

  it("keeps the status timeline but only the seeker's own notes, and never changedBy", () => {
    const out = redactApplicationForSeeker(leakyApplication, SEEKER_USER) as typeof leakyApplication;
    expect(out.statusHistory).toEqual([
      { status: "applied", changedAt: "2026-09-01", note: "Application submitted" },
      { status: "rejected", changedAt: "2026-09-02" },
    ]);
    expect(JSON.stringify(out)).not.toContain("culture fit");
    expect(JSON.stringify(out)).not.toContain(EMPLOYER_USER);
  });

  it("shows the engine score, not the employer's re-weighted ranking", () => {
    expect(redactApplicationForSeeker(leakyApplication, SEEKER_USER).aiMatchScore).toBe(71);
  });

  it("projection excludes the same fields at query time", () => {
    for (const key of SEEKER_HIDDEN_APPLICATION_FIELDS) {
      expect(SEEKER_APPLICATION_PROJECTION.split(" ")).toContain(`-${key}`);
    }
  });
});

// ── Route-level: the list handler applies both ───────────────────────────────

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => async (req: NextRequest) =>
    handler(req, { userId: "64b0000000000000000000a1", role: "job_seeker", locale: "en" }),
}));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["skip", "limit", "select", "populate", "sort"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
const appQuery = chain([]);
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { find: jest.fn(() => appQuery), countDocuments: jest.fn(async () => 1), aggregate: jest.fn(async () => []) },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: "64b0000000000000000000b1" }) }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
  },
}));
for (const model of ["@/models/Interview", "@/models/Offer", "@/models/Placement", "@/models/BackgroundCheck"]) {
  jest.doMock(model, () => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "sort", "limit", "populate"]) c[m] = () => c;
    c.lean = async () => [];
    const Model = { find: jest.fn(() => c) };
    return { __esModule: true, default: Model, BackgroundCheck: Model };
  });
}

describe("GET /api/applications as job_seeker", () => {
  it("queries with the seeker projection and redacts the response", async () => {
    appQuery.lean.mockResolvedValueOnce([leakyApplication]);
    const { getHandler } = await import("@/app/api/applications/handlers");
    const { withAuth } = await import("@/lib/auth/withAuth");
    const wrapped = withAuth(getHandler) as unknown as (req: NextRequest) => Promise<Response>;
    const res = await wrapped(new NextRequest("http://localhost:3888/api/applications?limit=10"));
    expect(res.status).toBe(200);

    expect(appQuery.select).toHaveBeenCalledWith(SEEKER_APPLICATION_PROJECTION);
    const body = await res.json();
    const [app] = body.applications;
    for (const key of SEEKER_HIDDEN_APPLICATION_FIELDS) expect(app).not.toHaveProperty(key);
    expect(JSON.stringify(body)).not.toContain("internal: weak communicator");
    expect(JSON.stringify(body)).not.toContain("culture fit");
  });
});
