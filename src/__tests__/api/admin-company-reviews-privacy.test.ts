/**
 * @jest-environment node
 *
 * SEC-E4: the moderation list is admin-only, never carries the reviewer's
 * email, and keeps anonymous reviews anonymous.
 */
import { NextRequest } from "next/server";

let role = "admin";
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) =>
    handler(req, { userId: "u1", role, locale: "en" }),
}));

const populate = jest.fn();
const find = jest.fn();
jest.mock("@/models/CompanyReview", () => ({
  __esModule: true,
  default: { find: (q: unknown) => find(q), countDocuments: jest.fn().mockResolvedValue(2) },
}));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

import { GET } from "@/app/api/admin/company-reviews/route";

const call = () => GET(new NextRequest("http://localhost/api/admin/company-reviews"), { params: Promise.resolve({}) });

beforeEach(() => {
  jest.clearAllMocks();
  role = "admin";
  const query: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit"]) query[m] = jest.fn(() => query);
  query.populate = jest.fn((...a: unknown[]) => {
    populate(...a);
    return query;
  });
  query.lean = jest.fn().mockResolvedValue([
    { _id: "r1", isAnonymous: false, userId: { _id: "a", name: "Named" } },
    { _id: "r2", isAnonymous: true, userId: { _id: "b", name: "Hidden" } },
  ]);
  find.mockReturnValue(query);
});

it.each(["agent", "super_agent", "employer"])("returns 403 for %s", async (r) => {
  role = r;
  expect((await call()).status).toBe(403);
  expect(find).not.toHaveBeenCalled();
});

it("never populates the reviewer email and strips anonymous authors", async () => {
  const res = await call();
  expect(res.status).toBe(200);
  expect(populate).toHaveBeenCalledWith("userId", "name");
  const { items } = await res.json();
  expect(items[0].userId).toEqual({ _id: "a", name: "Named" });
  expect(items[1]).not.toHaveProperty("userId");
});
