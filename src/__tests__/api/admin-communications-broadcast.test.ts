/**
 * @jest-environment node
 */
/**
 * Admin → System → Broadcasts.
 *
 * The History tab used to read `type: "system"` notifications. Every automated
 * notice (review requests, invoice reminders, renewals) uses that type too,
 * and one broadcast writes one notification per recipient, so the tab listed
 * reminders and receipts and never an actual broadcast. History now reads the
 * one audit entry each send writes.
 */
import { NextRequest, NextResponse } from "next/server";

let ctxRole: "admin" | "super_agent" = "admin";
const ADMIN_ID = "64d000000000000000000001";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
const inngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: (...a: unknown[]) => inngestSend(...a) } }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await handler(req, { userId: ADMIN_ID, role: ctxRole, locale: "en" });
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn().mockResolvedValue(result);
  return c;
}

const auditFind = jest.fn();
jest.mock("@/models/AuditLog", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => auditFind(...a) },
}));
const notificationFind = jest.fn();
jest.mock("@/models/Notification", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => notificationFind(...a) },
}));
const userCount = jest.fn().mockResolvedValue(411);
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { countDocuments: (...a: unknown[]) => userCount(...a) },
}));

import { GET, POST } from "@/app/api/admin/communications/route";
import { GET as GET_AUDIENCE } from "@/app/api/admin/communications/audience/route";

// withAuth-wrapped handlers take the route context as their second argument.
const noParams = { params: Promise.resolve({}) };
const url = (path: string) => `http://localhost/api/admin/communications${path}`;
const post = (body: unknown) =>
  new NextRequest(url(""), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  ctxRole = "admin";
  jest.clearAllMocks();
});

describe("broadcast history", () => {
  it("lists one row per broadcast from the audit log, not per-recipient notifications", async () => {
    auditFind.mockReturnValue(
      chain([
        {
          _id: "a1",
          createdAt: new Date("2026-09-28T10:00:00Z"),
          meta: { title: "Maintenance tonight", message: "Down 1–2am", channels: ["in_app", "email"], recipientCount: 411, targetRoles: "all" },
        },
      ])
    );

    const res = await GET(new NextRequest(url("")), noParams);
    const body = await res.json();

    expect(auditFind).toHaveBeenCalledWith({ action: "communication.broadcast" });
    expect(notificationFind).not.toHaveBeenCalled();
    expect(body.broadcasts).toEqual([
      expect.objectContaining({
        _id: "a1",
        title: "Maintenance tonight",
        body: "Down 1–2am",
        channels: ["in_app", "email"],
        recipientCount: 411,
        audience: "all",
      }),
    ]);
  });

  it("keeps entries written before the message was stored", async () => {
    auditFind.mockReturnValue(
      chain([{ _id: "a0", createdAt: new Date(), meta: { title: "Old", targetRoles: ["employer"], recipientCount: 12 } }])
    );
    const body = await (await GET(new NextRequest(url("")), noParams)).json();
    expect(body.broadcasts[0]).toEqual(expect.objectContaining({ title: "Old", body: "", channels: ["in_app"], audience: ["employer"] }));
  });

  it("is admin-only", async () => {
    ctxRole = "super_agent";
    expect((await GET(new NextRequest(url("")), noParams)).status).toBe(403);
  });
});

describe("sending", () => {
  it("queues the broadcast and records its message for the history", async () => {
    const res = await POST(post({ title: "Hello", message: "World", targetAll: true, channels: ["in_app"] }), noParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ queued: true, sent: 411 }));
    expect(inngestSend).toHaveBeenCalledWith(expect.objectContaining({ name: "admin/broadcast" }));
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "communication.broadcast",
        meta: expect.objectContaining({ title: "Hello", message: "World", recipientCount: 411 }),
      })
    );
  });

  // The worker only delivers in-app and email; WhatsApp was offered and silently dropped.
  it("refuses a channel the broadcast worker cannot deliver", async () => {
    const res = await POST(post({ title: "Hi", message: "There", targetAll: true, channels: ["whatsapp"] }), noParams);
    expect(res.status).toBe(400);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});

describe("audience count (shown before sending)", () => {
  it("counts every active user when no role is picked", async () => {
    const res = await GET_AUDIENCE(new NextRequest(url("/audience")), noParams);
    expect(await res.json()).toEqual({ count: 411 });
    expect(userCount).toHaveBeenCalledWith({ isActive: true });
  });

  it("counts only the picked roles and ignores unknown ones", async () => {
    await GET_AUDIENCE(new NextRequest(url("/audience?roles=employer,agent,hacker")), noParams);
    expect(userCount).toHaveBeenCalledWith({ isActive: true, role: { $in: ["employer", "agent"] } });
  });

  it("is admin-only", async () => {
    ctxRole = "super_agent";
    expect((await GET_AUDIENCE(new NextRequest(url("/audience")), noParams)).status).toBe(403);
  });
});
