/**
 * @jest-environment node
 *
 * The Notes tab used to be write-only: POST pushed a note onto the application
 * and nothing ever read it back, so a recruiter reloading the panel saw an
 * empty composer and assumed the note was lost. GET closes that loop, and must
 * carry exactly the same scope rules as POST — a history that reads wider than
 * the composer writes would be an IDOR by omission.
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const OTHER_EMPLOYER_ID = "64b000000000000000000003";
const APP_ID = "64b000000000000000000030";

let currentCtx = { userId: EMPLOYER_USER, role: "employer", locale: "en" };

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(req, currentCtx, params)),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(() => Promise.resolve(undefined)), actorFromCtx: () => ({}) }));
jest.mock("@/lib/notifications/trigger", () => ({ notifyMention: jest.fn(() => Promise.resolve(undefined)) }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn(async () => null) }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

const application = {
  _id: APP_ID,
  employerId: EMPLOYER_ID,
  agentId: null,
  jobSeekerId: { name: "Job Seeker" },
  notes: [
    { _id: "n1", authorId: EMPLOYER_USER, authorName: "Hiring Lead", content: "First look — strong CV.", createdAt: new Date("2026-09-01T10:00:00Z") },
    { _id: "n2", authorId: EMPLOYER_USER, authorName: "Hiring Lead", content: "MERN stack skills verified.", createdAt: new Date("2026-09-02T10:00:00Z") },
  ],
};

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain(application)), findByIdAndUpdate: jest.fn(async () => undefined) },
}));
const employerFindOne = jest.fn(() => chain({ _id: EMPLOYER_ID }));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: (...a: unknown[]) => employerFindOne(...(a as [])) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain(null)) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: jest.fn(() => chain({ name: "Hiring Lead" })) } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET } = require("@/app/api/applications/[id]/notes/route") as typeof import("@/app/api/applications/[id]/notes/route");

function call(id = APP_ID) {
  return GET(
    new NextRequest(`http://localhost/api/applications/${id}/notes`),
    { params: Promise.resolve({ id }) } as never,
  );
}

beforeEach(() => {
  currentCtx = { userId: EMPLOYER_USER, role: "employer", locale: "en" };
  employerFindOne.mockImplementation(() => chain({ _id: EMPLOYER_ID }));
});

describe("GET /api/applications/[id]/notes", () => {
  it("returns the saved notes newest-first so a reload shows the history", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toHaveLength(2);
    expect(body.notes[0].content).toBe("MERN stack skills verified.");
    expect(body.notes[0].authorName).toBe("Hiring Lead");
    expect(body.notes[0].createdAt).toBe("2026-09-02T10:00:00.000Z");
  });

  it("refuses an employer who does not own the application", async () => {
    employerFindOne.mockImplementation(() => chain({ _id: OTHER_EMPLOYER_ID }));
    const res = await call();
    expect(res.status).toBe(403);
  });

  it("refuses a job seeker outright — notes are internal", async () => {
    currentCtx = { userId: "64b000000000000000000099", role: "job_seeker", locale: "en" };
    const res = await call();
    expect(res.status).toBe(403);
  });

  it("rejects a non-ObjectId id before touching the database", async () => {
    const res = await call("not-an-id");
    expect(res.status).toBe(400);
  });
});
