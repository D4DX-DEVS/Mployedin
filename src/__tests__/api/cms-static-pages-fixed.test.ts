/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (
    handler: (req: NextRequest, ctx: { userId: string; role: "admin"; locale: string }, params?: Record<string, string>) => Promise<Response>,
  ) => {
    return async (req: NextRequest, routeCtx?: { params?: Promise<Record<string, string>> }) =>
      handler(req, { userId: "admin_user_001", role: "admin", locale: "en" }, await routeCtx?.params);
  },
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

const listQuery = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), lean: jest.fn() };
Object.values(listQuery).forEach((fn) => (fn as jest.Mock).mockReturnThis());
(listQuery.lean as jest.Mock).mockResolvedValue([]);

const pageDoc = {
  _id: "64b000000000000000000001",
  slug: "privacy-policy",
  title: "Privacy Policy",
  save: jest.fn().mockResolvedValue(undefined),
};

jest.mock("@/models/StaticPage", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => listQuery),
    countDocuments: jest.fn().mockResolvedValue(4),
    bulkWrite: jest.fn().mockResolvedValue({}),
    findById: jest.fn(),
    findOne: jest.fn(),
  },
}));

const ID = "64b000000000000000000001";

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost:3000${url}`, init);
}

describe("admin static pages — fixed four legal pages", () => {
  const StaticPage = require("@/models/StaticPage").default;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(listQuery).forEach((fn) => (fn as jest.Mock).mockReturnThis());
    (listQuery.lean as jest.Mock).mockResolvedValue([]);
  });

  it("lists only the four legal slugs, so test pages like 'Audit Dynamic Page' drop out", async () => {
    const { GET } = await import("@/app/api/admin/cms/static-pages/route");
    const res = await GET(req("/api/admin/cms/static-pages"), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const filter = StaticPage.find.mock.calls[0][0];
    expect(filter.slug).toEqual({ $in: ["privacy-policy", "terms-and-conditions", "cookie-policy", "gdpr"] });
  });

  it("creates a missing legal page as an inactive draft instead of leaving it uneditable", async () => {
    const { GET } = await import("@/app/api/admin/cms/static-pages/route");
    await GET(req("/api/admin/cms/static-pages"), { params: Promise.resolve({}) });

    const ops = StaticPage.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(4);
    const privacy = ops.find((op: { updateOne: { filter: { slug: string } } }) => op.updateOne.filter.slug === "privacy-policy");
    expect(privacy.updateOne.upsert).toBe(true);
    // $setOnInsert only — an existing page's content is never touched.
    expect(Object.keys(privacy.updateOne.update)).toEqual(["$setOnInsert"]);
    expect(privacy.updateOne.update.$setOnInsert).toMatchObject({ title: "Privacy Policy", isActive: false });
  });

  it("never bumps an existing page's updatedAt — the public 'Last updated' date reads it", async () => {
    const { GET } = await import("@/app/api/admin/cms/static-pages/route");
    await GET(req("/api/admin/cms/static-pages"), { params: Promise.resolve({}) });

    const ops = StaticPage.bulkWrite.mock.calls[0][0];
    for (const op of ops) {
      // Mongoose otherwise adds `$set: { updatedAt: now }` to every matched page.
      expect(op.updateOne.timestamps).toBe(false);
      expect(op.updateOne.update.$setOnInsert.updatedAt).toBeInstanceOf(Date);
    }
  });

  it("still lists the pages when a concurrent load already inserted a missing one", async () => {
    StaticPage.bulkWrite.mockRejectedValueOnce(Object.assign(new Error("E11000"), { code: 11000, writeErrors: [{ code: 11000 }] }));
    const { GET } = await import("@/app/api/admin/cms/static-pages/route");
    const res = await GET(req("/api/admin/cms/static-pages"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it("offers no create or delete — only the four pages exist", async () => {
    const listRoute = await import("@/app/api/admin/cms/static-pages/route");
    const itemRoute = await import("@/app/api/admin/cms/static-pages/[id]/route");
    expect("POST" in listRoute).toBe(false);
    expect("DELETE" in itemRoute).toBe(false);
  });

  it("treats a page outside the four (e.g. the old 'Audit Dynamic Page') as not found", async () => {
    const orphan = { _id: ID, slug: "audit-dynamic-page", title: "Audit Dynamic Page", save: jest.fn() };
    StaticPage.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(orphan), then: undefined });
    const { GET, PATCH } = await import("@/app/api/admin/cms/static-pages/[id]/route");

    const read = await GET(req(`/api/admin/cms/static-pages/${ID}`), { params: Promise.resolve({ id: ID }) });
    expect(read.status).toBe(404);

    StaticPage.findById.mockResolvedValue(orphan);
    const edit = await PATCH(
      req(`/api/admin/cms/static-pages/${ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Revived" }),
      }),
      { params: Promise.resolve({ id: ID }) },
    );
    expect(edit.status).toBe(404);
    expect(orphan.save).not.toHaveBeenCalled();
  });

  it("ignores a slug sent with an edit", async () => {
    StaticPage.findById.mockResolvedValue(pageDoc);
    const { PATCH } = await import("@/app/api/admin/cms/static-pages/[id]/route");
    const res = await PATCH(
      req(`/api/admin/cms/static-pages/${ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "moved-away", title: "Privacy notice" }),
      }),
      { params: Promise.resolve({ id: ID }) },
    );

    expect(res.status).toBe(200);
    expect(pageDoc.slug).toBe("privacy-policy");
    expect(pageDoc.title).toBe("Privacy notice");
  });
});

describe("public static page API", () => {
  const StaticPage = require("@/models/StaticPage").default;

  beforeEach(() => jest.clearAllMocks());

  it("404s a slug that is not one of the four legal pages without touching the DB", async () => {
    const { GET } = await import("@/app/api/public/pages/[slug]/route");
    const res = await GET(req("/api/public/pages/audit-dynamic-page"), {
      params: Promise.resolve({ slug: "audit-dynamic-page" }),
    });

    expect(res.status).toBe(404);
    expect(StaticPage.findOne).not.toHaveBeenCalled();
  });

  it("returns the title and last-updated date the legal page renders", async () => {
    StaticPage.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ slug: "gdpr", title: "GDPR", body: "<p>x</p>", updatedAt: "2026-09-28T00:00:00.000Z" }),
      }),
    });
    const { GET } = await import("@/app/api/public/pages/[slug]/route");
    const res = await GET(req("/api/public/pages/gdpr"), { params: Promise.resolve({ slug: "gdpr" }) });

    expect(res.status).toBe(200);
    const { page } = await res.json();
    expect(page).toMatchObject({ title: "GDPR", updatedAt: "2026-09-28T00:00:00.000Z" });
  });
});
