/**
 * @jest-environment node
 *
 * PATCH/DELETE /api/commissions/[id] status rules:
 * - A line moves pending → approved → paid; it cannot skip approval, a
 *   clawed-back line is final, and only paid money can be clawed back.
 * - Each new dispute clears the previous resolution, so it can be resolved again.
 * - An invoice's commission is removed by voiding or cancelling the invoice, and
 *   a paid one by clawback — neither is deleted from this page.
 */
import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db/mongoose", () => ({ connectDB }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/integrations/webhookDispatcher", () => ({ dispatchWebhook: jest.fn() }));
jest.mock("@/lib/notifications/trigger", () => ({
  notifyCommissionApproved: jest.fn().mockResolvedValue(undefined),
  notifyCommissionPaid: jest.fn().mockResolvedValue(undefined),
}));

const ID = "507f1f77bcf86cd799439071";
type Doc = Record<string, unknown> & { save: jest.Mock };
const doc = (overrides: Record<string, unknown> = {}): Doc => ({
  _id: ID, type: "placement", agentId: "agent_1", superAgentId: "sa_1", invoiceId: "inv_1",
  amount: 500, currency: "AED", status: "pending", save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});
let currentDoc = doc();
const findByIdAndDelete = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => currentDoc), findByIdAndDelete: (...a: unknown[]) => findByIdAndDelete(...a) },
}));
const profile = () => ({ select: () => ({ lean: jest.fn().mockResolvedValue({ userId: "u" }) }) });
const none = () => ({ select: () => ({ lean: jest.fn().mockResolvedValue(null) }) });
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: none, findById: profile } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: none, findById: profile } }));

const request = (method: string, body?: Record<string, unknown>) =>
  new NextRequest(`http://localhost:3000/api/commissions/${ID}`, {
    method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/commissions/[id]/route");
  const res = await PATCH(request("PATCH", body), { params: Promise.resolve({ id: ID }) });
  return { status: res.status, body: await res.json() };
}

async function remove() {
  const { DELETE } = await import("@/app/api/commissions/[id]/route");
  const res = await DELETE(request("DELETE"), { params: Promise.resolve({ id: ID }) });
  return { status: res.status, body: await res.json() };
}

describe("commission status rules", () => {
  const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
  });

  it.each([
    ["pending", "paid", {}],
    ["pending", "clawed_back", {}],
    ["approved", "pending", {}],
    ["approved", "clawed_back", {}],
    ["paid", "approved", { paidAt: new Date() }],
    ["clawed_back", "paid", { paidAt: new Date() }],
    ["disputed", "paid", { paidAt: new Date() }],
    ["disputed", "clawed_back", {}],
  ])("refuses %s → %s", async (from, to, extra) => {
    currentDoc = doc({ status: from, ...extra });
    const res = await patch({ status: to, paymentRef: "X" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/can't be marked/);
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it.each([
    ["pending", "approved", {}],
    ["pending", "disputed", {}],
    ["approved", "disputed", {}],
    ["paid", "clawed_back", { paidAt: new Date() }],
    ["disputed", "clawed_back", { paidAt: new Date() }],
  ])("allows %s → %s", async (from, to, extra) => {
    currentDoc = doc({ status: from, ...extra });
    const res = await patch({ status: to, disputeReason: "Wrong rate", clawbackReason: "Refund" });
    expect(res.status).toBe(200);
    expect(currentDoc.status).toBe(to);
  });

  it("a new dispute clears the last resolution and can be resolved again", async () => {
    currentDoc = doc({
      status: "approved", approvedAt: new Date(),
      disputeResolution: "resolved", resolvedAt: new Date("2026-09-01"), resolvedBy: "admin_000",
    });
    await patch({ status: "disputed", disputeReason: "Second query" });
    expect(currentDoc).toMatchObject({ status: "disputed", disputeResolution: undefined, resolvedAt: undefined });

    const res = await patch({ disputeResolution: "resolved" });
    expect(res.status).toBe(200);
    expect(currentDoc).toMatchObject({ status: "approved", disputeResolution: "resolved", resolvedBy: "admin_001" });
  });

  it("a rejected dispute closes it too; an escalated one stays open", async () => {
    currentDoc = doc({ status: "disputed", paidAt: new Date("2026-09-10") });
    await patch({ disputeResolution: "escalated" });
    expect(currentDoc).toMatchObject({ status: "disputed", disputeResolution: "escalated" });
    expect(currentDoc.resolvedAt).toBeUndefined();

    await patch({ disputeResolution: "rejected" });
    expect(currentDoc).toMatchObject({ status: "paid", disputeResolution: "rejected", resolvedBy: "admin_001" });
  });

  it("refuses to resolve a commission that isn't disputed", async () => {
    currentDoc = doc({ status: "approved" });
    const res = await patch({ disputeResolution: "resolved" });
    expect(res.status).toBe(422);
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it("refuses to delete an invoice's commission", async () => {
    currentDoc = doc({ status: "pending" });
    const res = await remove();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/void or cancel the invoice/i);
    expect(findByIdAndDelete).not.toHaveBeenCalled();
  });

  it.each(["paid", "clawed_back", "disputed"])("refuses to delete a paid-out %s commission", async (status) => {
    currentDoc = doc({ status, invoiceId: undefined, paidAt: new Date() });
    const res = await remove();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/clawback/i);
    expect(findByIdAndDelete).not.toHaveBeenCalled();
  });

  it("still deletes an unpaid commission with no invoice", async () => {
    currentDoc = doc({ status: "pending", invoiceId: undefined });
    const res = await remove();
    expect(res.status).toBe(200);
    expect(findByIdAndDelete).toHaveBeenCalledWith(ID);
  });
});
