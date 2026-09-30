/**
 * @jest-environment node
 *
 * POST /api/jobs/[id]/rescore — "Re-score all" (client report 2026-09-30:
 * "Matching score of candidate will not update if the criteria of scoring
 * updated in the job"). The automatic re-score runs on the queue; when it
 * doesn't, "Score all" skipped every candidate that already had a score, so a
 * stale score could never be refreshed from the UI. This runs the same scorer
 * inline for the job's applicants.
 */
import { NextRequest } from "next/server";

const JOB_ID = "651000000000000000000003";
let mockCtx = { userId: "651000000000000000000009", role: "employer", locale: "en" };
const mockCanAccessJob = jest.fn();
const mockListTargets = jest.fn();
const mockRescoreBatch = jest.fn();
const mockQueue = jest.fn().mockResolvedValue(undefined);
const mockJobFind = jest.fn();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: unknown) => Promise<Response>) =>
    (req: NextRequest, route: { params: Promise<Record<string, string>> }) => route.params.then((p) => handler(req, mockCtx, p)),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/jobs/access", () => ({ canAccessJob: (...a: unknown[]) => mockCanAccessJob(...a) }));
jest.mock("@/lib/inngest/rescoreJobApplicants", () => ({
  RESCORE_BATCH_SIZE: 25,
  listRescoreTargets: (...a: unknown[]) => mockListTargets(...a),
  rescoreApplicantBatch: (...a: unknown[]) => mockRescoreBatch(...a),
  queueApplicantRescore: (...a: unknown[]) => mockQueue(...a),
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: () => mockJobFind() }) }) },
}));

async function post(id = JOB_ID) {
  const { POST } = await import("@/app/api/jobs/[id]/rescore/route");
  const req = new NextRequest(`http://localhost:3000/api/jobs/${id}/rescore`, { method: "POST" });
  return POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCtx = { userId: "651000000000000000000009", role: "employer", locale: "en" };
  mockJobFind.mockResolvedValue({ _id: JOB_ID, employerId: "e1", agentId: null });
  mockCanAccessJob.mockResolvedValue(true);
  mockListTargets.mockResolvedValue(["a1", "a2", "a3"]);
  mockRescoreBatch.mockImplementation(async (_job: string, ids: string[]) => ids.length);
});

describe("POST /api/jobs/[id]/rescore", () => {
  it("re-scores every applicant of a job the caller may access, with the canonical scorer", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rescored: 3, total: 3, queuedRest: false });
    expect(mockRescoreBatch).toHaveBeenCalledWith(JOB_ID, ["a1", "a2", "a3"]);
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it("refuses a caller who cannot access the job, without scoring", async () => {
    mockCanAccessJob.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(403);
    expect(mockRescoreBatch).not.toHaveBeenCalled();
  });

  it("404s an unknown job and 400s a malformed id", async () => {
    mockJobFind.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect((await post("not-an-id")).status).toBe(400);
    expect(mockRescoreBatch).not.toHaveBeenCalled();
  });

  it("scores in batches and hands anything past the inline cap to the queue", async () => {
    const ids = Array.from({ length: 301 }, (_, i) => `a${i}`);
    mockListTargets.mockResolvedValue(ids);
    const res = await post();
    const body = await res.json();
    expect(body).toEqual({ rescored: 300, total: 301, queuedRest: true });
    for (const [, batch] of mockRescoreBatch.mock.calls) expect((batch as string[]).length).toBeLessThanOrEqual(25);
    expect(mockQueue).toHaveBeenCalledWith([JOB_ID]);
  });
});
