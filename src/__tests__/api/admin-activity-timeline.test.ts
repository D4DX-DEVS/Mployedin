/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: "admin"; locale: string }) => Promise<Response>) => {
    return (req: NextRequest) => handler(req, { userId: "admin_user_001", role: "admin", locale: "en" });
  },
}));

const auditQuery = {
  sort: jest.fn(),
  skip: jest.fn(),
  limit: jest.fn(),
  populate: jest.fn(),
  lean: jest.fn(),
};

Object.values(auditQuery).forEach((fn) => (fn as jest.Mock).mockReturnThis());
(auditQuery.lean as jest.Mock).mockResolvedValue([
  {
    _id: "audit_001",
    actorId: { _id: "user_001", name: "Admin User", email: "admin@example.com", role: "admin" },
    actorRole: "admin",
    action: "login.success",
    resource: "auth",
    meta: { provider: "credentials" },
    createdAt: "2026-06-04T00:00:00.000Z",
  },
]);

const userFindQuery = {
  select: jest.fn(),
  lean: jest.fn(),
};

(userFindQuery.select as jest.Mock).mockReturnValue(userFindQuery);
(userFindQuery.lean as jest.Mock).mockResolvedValue([{ _id: "user_001" }]);

jest.mock("@/models/AuditLog", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue(auditQuery),
    countDocuments: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue(userFindQuery),
  },
}));

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`);
}

const routeContext = { params: Promise.resolve({}) };

describe("Admin activity timeline API", () => {
  const AuditLog = require("@/models/AuditLog").default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("queries and populates AuditLog.actorId instead of stale userId", async () => {
    const { GET } = await import("@/app/api/admin/activity-timeline/route");
    const res = await GET(makeRequest("/api/admin/activity-timeline?search=admin&role=admin"), routeContext);

    expect(res.status).toBe(200);
    expect(AuditLog.find).toHaveBeenCalledWith({
      actorId: { $in: ["user_001"] },
      actorRole: "admin",
    });
    expect(auditQuery.populate).toHaveBeenCalledWith("actorId", "name email role");
    expect(auditQuery.populate).not.toHaveBeenCalledWith("userId", expect.any(String));

    const payload = await res.json();
    expect(payload.items[0]).toEqual(expect.objectContaining({
      userId: "user_001",
      userName: "Admin User",
      userEmail: "admin@example.com",
      userRole: "admin",
    }));
  });

  it("short-circuits when search matches no users", async () => {
    (userFindQuery.lean as jest.Mock).mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/admin/activity-timeline/route");
    const res = await GET(makeRequest("/api/admin/activity-timeline?search=missing"), routeContext);

    expect(res.status).toBe(200);
    expect(AuditLog.find).not.toHaveBeenCalled();
    expect(AuditLog.countDocuments).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ items: [], total: 0 });
  });
});