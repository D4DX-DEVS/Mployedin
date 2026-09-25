/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const ADMIN_ID = "64b000000000000000000a01";
const REVIEW_ID = "64b000000000000000000b01";
const guards: { resource: string; action: string }[] = [];

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>, options: { resource: string; action: string }) => {
      guards.push(options);
      return async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) =>
        handler(req, { userId: ADMIN_ID, role: "admin", locale: "en" }, context ? await context.params : {});
    },
}));

const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  logActivity: (entry: unknown) => logActivity(entry),
  actorFromCtx: (ctx: { userId: string; role: string }) => ({ actorId: ctx.userId, actorRole: ctx.role }),
}));

const find = jest.fn();
const countDocuments = jest.fn();
const findById = jest.fn();
jest.mock("@/models/CompanyReview", () => ({
  __esModule: true,
  default: {
    find: (q: unknown) => find(q),
    countDocuments: (q: unknown) => countDocuments(q),
    findById: (id: unknown) => findById(id),
  },
}));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

function chain(result: unknown) {
  const query: Record<string, jest.Mock> = {};
  for (const method of ["sort", "skip", "limit", "populate"]) query[method] = jest.fn(() => query);
  query.lean = jest.fn().mockResolvedValue(result);
  return query;
}

describe("admin company reviews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    countDocuments.mockResolvedValue(1);
  });

  it("guards listing with employers:read and moderating with employers:approve", async () => {
    await import("@/app/api/admin/company-reviews/route");
    await import("@/app/api/admin/company-reviews/[id]/route");
    expect(guards).toEqual([
      { resource: "employers", action: "read" },
      { resource: "employers", action: "approve" },
    ]);
  });

  describe("GET", () => {
    it("lists pending reviews by default, newest first, with pagination", async () => {
      const query = chain([{ _id: REVIEW_ID, title: "Great team" }]);
      find.mockReturnValue(query);
      const { GET } = await import("@/app/api/admin/company-reviews/route");

      const res = await GET(new NextRequest("http://localhost/api/admin/company-reviews"), { params: Promise.resolve({}) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(find).toHaveBeenCalledWith({ status: "pending" });
      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(body).toEqual({ items: [{ _id: REVIEW_ID, title: "Great team" }], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
    });

    it("drops the status filter for all, escapes the search and clamps the page size", async () => {
      const query = chain([]);
      find.mockReturnValue(query);
      const { GET } = await import("@/app/api/admin/company-reviews/route");

      await GET(new NextRequest("http://localhost/api/admin/company-reviews?status=all&search=a.b&limit=500"), { params: Promise.resolve({}) });

      const filter = find.mock.calls[0][0] as { status?: string; $or: { title: { $regex: string } }[] };
      expect(filter.status).toBeUndefined();
      expect(filter.$or[0].title.$regex).toBe("a\\.b");
      expect(query.limit).toHaveBeenCalledWith(100);
    });

    it("treats an unknown status as pending", async () => {
      find.mockReturnValue(chain([]));
      const { GET } = await import("@/app/api/admin/company-reviews/route");
      await GET(new NextRequest("http://localhost/api/admin/company-reviews?status=deleted"), { params: Promise.resolve({}) });
      expect(find).toHaveBeenCalledWith({ status: "pending" });
    });
  });

  describe("PATCH", () => {
    const patch = async (id: string, body: unknown) => {
      const { PATCH } = await import("@/app/api/admin/company-reviews/[id]/route");
      return PATCH(
        new NextRequest(`http://localhost/api/admin/company-reviews/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),
        { params: Promise.resolve({ id }) },
      );
    };

    it("publishes a review and records who decided in the audit log", async () => {
      const review = { _id: REVIEW_ID, status: "pending", save: jest.fn().mockResolvedValue(undefined) };
      findById.mockResolvedValue(review);

      const res = await patch(REVIEW_ID, { status: "approved" });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ item: { _id: REVIEW_ID, status: "approved" } });
      expect(review.save).toHaveBeenCalled();
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ADMIN_ID,
          action: "company-review.approve",
          resource: "employers",
          resourceId: REVIEW_ID,
          changes: { before: { status: "pending" }, after: { status: "approved" } },
        }),
      );
    });

    it("rejects anything but approve or reject", async () => {
      const res = await patch(REVIEW_ID, { status: "pending" });
      expect(res.status).toBe(400);
      expect(findById).not.toHaveBeenCalled();
    });

    it("returns 400 for a malformed id and 404 for a missing review", async () => {
      expect((await patch("not-an-id", { status: "rejected" })).status).toBe(400);
      findById.mockResolvedValue(null);
      expect((await patch(REVIEW_ID, { status: "rejected" })).status).toBe(404);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });
});
