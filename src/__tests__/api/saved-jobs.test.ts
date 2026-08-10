/**
 * @jest-environment node
 *
 * SavedJob.jobSeekerId stores the JobSeeker profile _id (that is what
 * POST /api/jobs/[id]/save writes), NOT the User id. These routes used to query
 * by ctx.userId, so the list was always empty and every unsave 404'd. These
 * tests pin the id space: if a query ever goes back to the User id, they fail.
 */

import { NextRequest } from "next/server";

const SEEKER_ID = "seeker_profile_123";
const USER_ID = "user_001";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

// The real withAuth passes (req, ctx, params) — the params arg matters here.
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => unknown) =>
    (req: NextRequest, params?: Record<string, string>) =>
      handler(req, { userId: USER_ID, role: "job_seeker", locale: "en" }, params),
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: (ctx: { userId: string; role: string }) => ({ userId: ctx.userId, role: ctx.role }),
}));

jest.mock("@/lib/security/sanitize", () => ({
  isValidObjectId: (id?: string) => typeof id === "string" && id.length > 0,
}));

const savedJobFind = jest.fn();
const savedJobCount = jest.fn();
const savedJobDelete = jest.fn();

jest.mock("@/models/SavedJob", () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => savedJobFind(...args),
    countDocuments: (...args: unknown[]) => savedJobCount(...args),
    findOneAndDelete: (...args: unknown[]) => savedJobDelete(...args),
  },
}));

const jobSeekerFindOne = jest.fn();

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => jobSeekerFindOne(...args),
  },
}));

/** Mimics `JobSeeker.findOne(...).select(...).lean()`. */
function seekerLookup(result: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(result) }) };
}

/** Mimics `SavedJob.find(...).sort().skip().limit().populate().lean()`. */
function findChain(items: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["sort", "skip", "limit", "populate"]) {
    chain[method] = () => chain;
  }
  chain.lean = () => Promise.resolve(items);
  return chain;
}

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("Saved Jobs API — id space", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/saved-jobs", () => {
    it("queries by the JobSeeker profile _id, not the User id", async () => {
      const { GET } = await import("@/app/api/saved-jobs/route");

      jobSeekerFindOne.mockReturnValueOnce(seekerLookup({ _id: SEEKER_ID }));
      savedJobFind.mockReturnValueOnce(
        findChain([
          {
            _id: "saved_001",
            jobId: { _id: "job_001", title: "Senior Engineer" },
            savedAt: new Date().toISOString(),
          },
        ]),
      );
      savedJobCount.mockResolvedValueOnce(1);

      const res = await (GET as unknown as (r: NextRequest) => Promise<Response>)(
        makeRequest("/api/saved-jobs?page=1&limit=10"),
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(jobSeekerFindOne).toHaveBeenCalledWith({ userId: USER_ID });
      // The regression guard: the seeker profile id, never the user id.
      expect(savedJobFind).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID });
      expect(savedJobCount).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID });
      expect(data.items).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.totalPages).toBe(1);
    });

    it("returns an empty page when the seeker has no profile yet", async () => {
      const { GET } = await import("@/app/api/saved-jobs/route");

      jobSeekerFindOne.mockReturnValueOnce(seekerLookup(null));

      const res = await (GET as unknown as (r: NextRequest) => Promise<Response>)(
        makeRequest("/api/saved-jobs?page=1"),
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toEqual([]);
      expect(data.total).toBe(0);
      expect(savedJobFind).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/saved-jobs/[id]", () => {
    type DeleteRoute = (
      req: NextRequest,
      params?: Record<string, string>,
    ) => Promise<Response>;

    it("scopes the delete to the JobSeeker profile _id", async () => {
      const { DELETE } = await import("@/app/api/saved-jobs/[id]/route");

      jobSeekerFindOne.mockReturnValueOnce(seekerLookup({ _id: SEEKER_ID }));
      savedJobDelete.mockResolvedValueOnce({ _id: "saved_001" });

      const res = await (DELETE as unknown as DeleteRoute)(
        makeRequest("/api/saved-jobs/saved_001"),
        { id: "saved_001" },
      );

      expect(res.status).toBe(200);
      expect(savedJobDelete).toHaveBeenCalledWith({
        _id: "saved_001",
        jobSeekerId: SEEKER_ID,
      });
    });

    it("returns 404 when the saved job does not belong to the seeker", async () => {
      const { DELETE } = await import("@/app/api/saved-jobs/[id]/route");

      jobSeekerFindOne.mockReturnValueOnce(seekerLookup({ _id: SEEKER_ID }));
      savedJobDelete.mockResolvedValueOnce(null);

      const res = await (DELETE as unknown as DeleteRoute)(
        makeRequest("/api/saved-jobs/saved_002"),
        { id: "saved_002" },
      );

      expect(res.status).toBe(404);
    });

    it("rejects a malformed id before touching the database", async () => {
      const { DELETE } = await import("@/app/api/saved-jobs/[id]/route");

      const res = await (DELETE as unknown as DeleteRoute)(
        makeRequest("/api/saved-jobs/bad"),
        { id: "" },
      );

      expect(res.status).toBe(400);
      expect(jobSeekerFindOne).not.toHaveBeenCalled();
    });
  });
});
