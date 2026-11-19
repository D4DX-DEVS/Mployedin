/**
 * @jest-environment node
 *
 * POST /api/job-seekers/bulk-cv-download is no longer behind the admin list's
 * "Download CVs" (the shared export dialog and /api/cv-export/manifest replaced
 * it). What still calls it is the Copilot shortlist, which asks for the picked
 * seekers' details by id. So it is that and nothing else: admin only, ids
 * required (there is no "everyone matching these filters" mode any more), the
 * picked people back in the order sent.
 */
import { NextRequest } from "next/server";

let ctx: { userId: string; role: string };
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) =>
      h(req, ctx),
}));
jest.mock("@/lib/db/mongoose", () => {
  const connectDB = jest.fn().mockResolvedValue(undefined);
  return { __esModule: true, default: connectDB, connectDB };
});

const A = "650000000000000000000001";
const B = "650000000000000000000002";
const C = "650000000000000000000003";

const findMock = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: (filter: unknown) => {
      findMock(filter);
      const c: Record<string, unknown> = {};
      c.populate = () => c;
      c.select = () => c;
      c.limit = () => c;
      c.lean = async () => rows;
      return c;
    },
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

let rows: Array<Record<string, unknown>>;
const seeker = (id: string, over: Record<string, unknown> = {}) => ({
  _id: id,
  fullName: `Seeker ${id.slice(-1)}`,
  email: `s${id.slice(-1)}@example.com`,
  cv: { originalUrl: `https://cdn/${id}.pdf` },
  ...over,
});

async function post(body: unknown) {
  const { POST } = await import("@/app/api/job-seekers/bulk-cv-download/route");
  return (POST as unknown as (req: NextRequest) => Promise<Response>)(
    new NextRequest("http://localhost/api/job-seekers/bulk-cv-download", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  findMock.mockReset();
  ctx = { userId: "650000000000000000000999", role: "admin" };
  rows = [seeker(A), seeker(B), seeker(C, { cv: undefined })];
});

describe("POST /api/job-seekers/bulk-cv-download", () => {
  it("is admin only", async () => {
    ctx = { userId: ctx.userId, role: "agent" };
    const res = await post({ ids: [A] });
    expect(res.status).toBe(403);
    expect(findMock).not.toHaveBeenCalled();
  });

  it("needs ids: there is no filter mode any more", async () => {
    for (const body of [{}, { ids: [] }, { search: "welder", skills: ["x"] }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    expect(findMock).not.toHaveBeenCalled();
  });

  it("refuses ids that are not ids", async () => {
    const res = await post({ ids: ["nope", "../etc"] });
    expect(res.status).toBe(400);
    expect(findMock).not.toHaveBeenCalled();
  });

  it("returns the picked seekers who have a CV, in the order sent", async () => {
    const res = await post({ ids: [B, A, C] });
    const json = (await res.json()) as { cvs: Array<{ id: string; hasCV: boolean }>; total: number };

    expect(findMock).toHaveBeenCalledWith({ "cv.originalUrl": { $exists: true, $ne: "" }, _id: { $in: [B, A, C] } });
    expect(json.cvs.map((c) => c.id)).toEqual([B, A]);
    expect(json.total).toBe(2);
  });

  it("with includeWithoutCv, also returns the picked who have none (the shortlist sheet lists them)", async () => {
    rows = [seeker(A), seeker(C, { cv: undefined })]; // what the database returns for these two ids
    const res = await post({ ids: [A, C], includeWithoutCv: true });
    const json = (await res.json()) as { cvs: Array<{ id: string; hasCV: boolean }> };

    expect(findMock).toHaveBeenCalledWith({ _id: { $in: [A, C] } });
    expect(json.cvs).toEqual([
      expect.objectContaining({ id: A, hasCV: true }),
      expect.objectContaining({ id: C, hasCV: false, url: null }),
    ]);
  });

  it("looks up at most 200 ids", async () => {
    const many = Array.from({ length: 250 }, (_, i) => String(i).padStart(24, "0"));
    await post({ ids: many });
    const filter = findMock.mock.calls[0][0] as { _id: { $in: string[] } };
    expect(filter._id.$in).toHaveLength(200);
  });
});
