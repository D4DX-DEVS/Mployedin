/**
 * @jest-environment node
 *
 * Saved jobs, restored 2026-10-27 (client: "save job option in every job, and
 * a saved jobs page"). Pins: rows key on the JobSeeker PROFILE _id (the old
 * routes once queried the User id and always came back empty), save/unsave
 * are idempotent, and only a live job can be newly saved.
 */
import { NextRequest } from "next/server";

const SEEKER_ID = "seeker_profile_123";
const USER_ID = "user_001";
const JOB_ID = "6a00000000000000000000aa";
let role = "job_seeker";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => unknown) =>
    (req: NextRequest, params?: Record<string, string>) =>
      handler(req, { userId: USER_ID, role, locale: "en" }, params),
}));

const jobSeekerFindOne = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => jobSeekerFindOne(...a) },
}));

const jobFindOne = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => jobFindOne(...a) },
}));

const savedAggregate = jest.fn();
const savedUpdateOne = jest.fn();
const savedDeleteOne = jest.fn();
const savedExists = jest.fn();
const savedFind = jest.fn();
jest.mock("@/models/SavedJob", () => ({
  __esModule: true,
  default: {
    aggregate: (...a: unknown[]) => savedAggregate(...a),
    updateOne: (...a: unknown[]) => savedUpdateOne(...a),
    deleteOne: (...a: unknown[]) => savedDeleteOne(...a),
    exists: (...a: unknown[]) => savedExists(...a),
    find: (...a: unknown[]) => savedFind(...a),
  },
}));

import { GET as listGET } from "@/app/api/saved-jobs/route";
import { GET as idsGET } from "@/app/api/saved-jobs/ids/route";
import { PUT, DELETE } from "@/app/api/saved-jobs/[jobId]/route";

const lean = (v: unknown) => ({ select: () => ({ lean: () => Promise.resolve(v) }) });
const req = (url = "http://localhost/api/saved-jobs") => new NextRequest(url);
type Handler = (r: NextRequest, p?: Record<string, string>) => Promise<Response>;
const call = (h: unknown, r: NextRequest, p?: Record<string, string>) => (h as Handler)(r, p);

beforeEach(() => {
  role = "job_seeker";
  jest.clearAllMocks();
  jobSeekerFindOne.mockReturnValue(lean({ _id: SEEKER_ID }));
  savedUpdateOne.mockResolvedValue({});
  savedDeleteOne.mockResolvedValue({});
});

describe("GET /api/saved-jobs", () => {
  it("lists by the profile id, newest first, leaving deleted jobs out", async () => {
    savedAggregate
      .mockResolvedValueOnce([{ savedAt: "2026-10-27", job: { _id: JOB_ID, title: "Driver" } }])
      .mockResolvedValueOnce([{ total: 1 }]);
    const res = await call(listGET, req("http://localhost/api/saved-jobs?page=1&limit=25"));
    const body = await res.json();
    expect(body).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(body.items[0].job.title).toBe("Driver");
    const [pipeline] = savedAggregate.mock.calls[0] as [Record<string, unknown>[]];
    expect(pipeline[0]).toEqual({ $match: { jobSeekerId: SEEKER_ID } });
    expect(JSON.stringify(pipeline)).toContain('"deletedAt":null');
    expect(pipeline).toContainEqual({ $limit: 25 });
  });

  it("falls back to 10 per page for a size the pager does not offer", async () => {
    savedAggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await call(listGET, req("http://localhost/api/saved-jobs?limit=5000"));
    expect(savedAggregate.mock.calls[0][0]).toContainEqual({ $limit: 10 });
  });

  it("is seeker-only", async () => {
    role = "employer";
    expect((await call(listGET, req())).status).toBe(403);
  });
});

describe("GET /api/saved-jobs/ids", () => {
  it("returns the saved job ids as strings", async () => {
    savedFind.mockReturnValue({ sort: () => ({ limit: () => ({ select: () => ({ lean: () => Promise.resolve([{ jobId: JOB_ID }]) }) }) }) });
    const res = await call(idsGET, req());
    expect(await res.json()).toEqual({ ids: [JOB_ID] });
    expect(savedFind).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID });
  });
});

describe("PUT / DELETE /api/saved-jobs/[jobId]", () => {
  it("saves a live job with an upsert (idempotent)", async () => {
    jobFindOne.mockReturnValue(lean({ status: "active" }));
    const res = await call(PUT, req(), { jobId: JOB_ID });
    expect(await res.json()).toEqual({ saved: true });
    expect(savedUpdateOne).toHaveBeenCalledWith(
      { jobSeekerId: SEEKER_ID, jobId: JOB_ID },
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ jobSeekerId: SEEKER_ID, jobId: JOB_ID }) }),
      { upsert: true },
    );
  });

  it("treats a duplicate-key race as already saved", async () => {
    jobFindOne.mockReturnValue(lean({ status: "active" }));
    savedUpdateOne.mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));
    const res = await call(PUT, req(), { jobId: JOB_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: true });
  });

  it("refuses to newly save a closed job (409) but keeps an existing save", async () => {
    jobFindOne.mockReturnValue(lean({ status: "closed" }));
    savedExists.mockResolvedValueOnce(null);
    expect((await call(PUT, req(), { jobId: JOB_ID })).status).toBe(409);
    savedExists.mockResolvedValueOnce({ _id: "x" });
    const kept = await call(PUT, req(), { jobId: JOB_ID });
    expect(await kept.json()).toEqual({ saved: true });
    expect(savedUpdateOne).not.toHaveBeenCalled();
  });

  it("404s a missing or deleted job", async () => {
    jobFindOne.mockReturnValue(lean(null));
    expect((await call(PUT, req(), { jobId: JOB_ID })).status).toBe(404);
    expect(jobFindOne).toHaveBeenCalledWith({ _id: JOB_ID, deletedAt: null });
  });

  it("unsaves by profile id", async () => {
    const res = await call(DELETE, req(), { jobId: JOB_ID });
    expect(await res.json()).toEqual({ saved: false });
    expect(savedDeleteOne).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID, jobId: JOB_ID });
  });

  it("rejects a malformed id", async () => {
    expect((await call(PUT, req(), { jobId: "nope" })).status).toBe(400);
    expect((await call(DELETE, req(), { jobId: "nope" })).status).toBe(400);
  });
});
