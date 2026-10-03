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
let whatsAppEnabled = true;
jest.mock("@/models/SystemConfig", () => ({
  getWhatsAppSettings: async () => ({ enabled: whatsAppEnabled, dailyCapPerUser: 3, automations: {} }),
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
  whatsAppEnabled = true;
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
  // No broadcast in the last minute unless a test says otherwise (the duplicate check reads the history entries).
  beforeEach(() => auditFind.mockReturnValue(chain([])));

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

  it("rejects the WhatsApp channel without a template", async () => {
    const res = await POST(post({ title: "T", message: "M", targetAll: true, channels: ["in_app", "whatsapp"] }), noParams);
    expect(res.status).toBe(400);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it("queues the WhatsApp leg with a broadcast id", async () => {
    const whatsapp = { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "{{message}}"] };
    const res = await POST(post({ title: "T", message: "M", targetAll: true, channels: ["in_app", "whatsapp"], whatsapp }), noParams);
    expect(res.status).toBe(200);
    const data = inngestSend.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.whatsapp).toEqual(whatsapp);
    expect(typeof data.broadcastId).toBe("string");
    expect(logActivity.mock.calls[0][0].meta.broadcastId).toBe(data.broadcastId);
    expect(logActivity.mock.calls[0][0].meta.whatsappTemplate).toBe("mployedin_admin_announcement");
  });

  it("forwards no template and audits none when the WhatsApp channel is not selected", async () => {
    const whatsapp = { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}"] };
    const res = await POST(post({ title: "T", message: "M", targetAll: true, channels: ["in_app", "email"], whatsapp }), noParams);
    expect(res.status).toBe(200);
    expect((inngestSend.mock.calls[0][0].data as Record<string, unknown>).whatsapp).toBeUndefined();
    expect(logActivity.mock.calls[0][0].meta.whatsappTemplate).toBeUndefined();
  });

  it("accepts a zero-variable template and carries its empty parameter list", async () => {
    const whatsapp = { templateName: "hello_world", language: "en_US" };
    const res = await POST(post({ title: "T", message: "M", targetAll: true, channels: ["whatsapp"], whatsapp }), noParams);
    expect(res.status).toBe(200);
    expect((inngestSend.mock.calls[0][0].data as { whatsapp: unknown }).whatsapp).toEqual({ ...whatsapp, params: [] });
  });

  describe("while WhatsApp is switched off in its settings", () => {
    const whatsapp = { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "{{message}}"] };

    it("refuses a broadcast with the WhatsApp channel: 409 whatsapp_disabled, nothing queued or audited", async () => {
      whatsAppEnabled = false;
      const res = await POST(post({ title: "T", message: "M", targetAll: true, channels: ["in_app", "whatsapp"], whatsapp }), noParams);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "whatsapp_disabled" });
      expect(inngestSend).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
    });

    it("still sends a broadcast without the WhatsApp channel", async () => {
      whatsAppEnabled = false;
      const res = await POST(post({ title: "T", message: "M", targetAll: true, channels: ["in_app", "email"], whatsapp }), noParams);
      expect(res.status).toBe(200);
      expect(inngestSend).toHaveBeenCalledTimes(1);
    });
  });

  it("refuses a template name or language Meta would not accept", async () => {
    const bad = (whatsapp: unknown) => POST(post({ title: "T", message: "M", targetAll: true, channels: ["whatsapp"], whatsapp }), noParams);
    expect((await bad({ templateName: "Has Spaces", language: "en", params: [] })).status).toBe(400);
    expect((await bad({ templateName: "ok_name", language: "english", params: [] })).status).toBe(400);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});

// A double click, a retry after a slow answer, or a second tab must not mail every user twice. The history
// entry each send writes is the record: a second identical send by the same admin within 60 s is refused.
describe("a second identical broadcast within a minute", () => {
  const SENT = { title: "Hello", message: "World", targetRoles: "all", targetAll: true, channels: ["in_app", "email"], recipientCount: 411 };
  const recent = (meta: Record<string, unknown>) => auditFind.mockReturnValue(chain([{ _id: "a1", meta }]));
  const send = (body: Record<string, unknown>) => POST(post({ title: "Hello", message: "World", targetAll: true, channels: ["in_app", "email"], ...body }), noParams);
  beforeEach(() => auditFind.mockReturnValue(chain([])));

  it("is refused with 409 duplicate_broadcast, nothing queued or audited", async () => {
    recent(SENT);
    const res = await send({});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "duplicate_broadcast" });
    expect(inngestSend).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("looks only at this admin's broadcasts of the last 60 seconds", async () => {
    recent(SENT);
    await send({});
    const [filter] = auditFind.mock.calls[0] as [{ action: string; actorId: string; createdAt: { $gte: Date } }];
    expect(filter.action).toBe("communication.broadcast");
    expect(filter.actorId).toBe(ADMIN_ID);
    const age = Date.now() - filter.createdAt.$gte.getTime();
    expect(age).toBeGreaterThanOrEqual(59_000);
    expect(age).toBeLessThanOrEqual(61_000);
  });

  it("treats the same channels or roles in another order as the same broadcast", async () => {
    recent({ ...SENT, channels: ["email", "in_app"] });
    expect((await send({})).status).toBe(409);
    recent({ ...SENT, targetAll: false, targetRoles: ["agent", "employer"] });
    expect((await send({ targetAll: false, targetRoles: ["employer", "agent"] })).status).toBe(409);
  });

  it("records targetAll on the audit entry, so the next send can compare it", async () => {
    expect((await send({})).status).toBe(200);
    expect(logActivity.mock.calls[0][0].meta.targetAll).toBe(true);
  });

  // C6: the WhatsApp leg is part of what goes out. Another template is another broadcast; the same one is a duplicate.
  describe("with the WhatsApp channel", () => {
    const WA = (templateName: string) => ({ templateName, language: "en", params: [] });
    const SENT_WA = { ...SENT, channels: ["in_app", "whatsapp"], whatsappTemplate: "mployedin_admin_announcement" };

    it("sends one with another WhatsApp template", async () => {
      recent(SENT_WA);
      const res = await send({ channels: ["in_app", "whatsapp"], whatsapp: WA("mployedin_job_alert") });
      expect(res.status).toBe(200);
      expect(inngestSend).toHaveBeenCalledTimes(1);
    });

    it("refuses the same subject, message, audience, channels and template with 409", async () => {
      recent(SENT_WA);
      const res = await send({ channels: ["whatsapp", "in_app"], whatsapp: WA("mployedin_admin_announcement") });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "duplicate_broadcast" });
      expect(inngestSend).not.toHaveBeenCalled();
    });
  });

  it("sends one to everyone after the same one to the empty role list without targetAll", async () => {
    recent({ ...SENT, targetAll: false });
    expect((await send({ targetAll: true })).status).toBe(200);
  });

  it.each([
    ["another subject", { title: "Hello again" }],
    ["another message", { message: "World, part two" }],
    ["another audience", { targetAll: false, targetRoles: ["employer"] }],
    ["other channels", { channels: ["in_app"] }],
  ])("sends one with %s", async (_label, change) => {
    recent(SENT);
    const res = await send(change);
    expect(res.status).toBe(200);
    expect(inngestSend).toHaveBeenCalledTimes(1);
  });

  it("sends when this admin sent nothing in the last minute", async () => {
    expect((await send({})).status).toBe(200);
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
