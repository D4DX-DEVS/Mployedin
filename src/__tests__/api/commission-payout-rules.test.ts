/**
 * @jest-environment node
 *
 * PATCH /api/commissions/[id] rules for the admin Commissions page:
 * - Mark paid records how the money went out: a payment reference is required,
 *   the method and day are kept, and who paid it is stamped.
 * - An invoice-generated line's amount, rate, currency and type belong to its
 *   invoice and cannot be edited here; notes still can.
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

const ID = "507f1f77bcf86cd799439061";
type Doc = Record<string, unknown> & { save: jest.Mock };
const doc = (overrides: Record<string, unknown> = {}): Doc => ({
  _id: ID, type: "placement", agentId: "agent_1", superAgentId: "sa_1", invoiceId: "inv_1",
  amount: 500, currency: "AED", status: "approved", save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});
let currentDoc = doc();
jest.mock("@/models/Commission", () => ({ __esModule: true, default: { findById: jest.fn(() => currentDoc) } }));
const profile = () => ({ select: () => ({ lean: jest.fn().mockResolvedValue({ userId: "u" }) }) });
const none = () => ({ select: () => ({ lean: jest.fn().mockResolvedValue(null) }) });
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: none, findById: profile } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: none, findById: profile } }));

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/commissions/[id]/route");
  const req = new NextRequest(`http://localhost:3000/api/commissions/${ID}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const res = await PATCH(req, { params: Promise.resolve({ id: ID }) });
  return { status: res.status, body: await res.json() };
}

describe("commission payout and edit rules", () => {
  const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };
  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
  });

  it("refuses Mark paid without a payment reference", async () => {
    currentDoc = doc();
    const res = await patch({ status: "paid" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/payment reference/i);
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it("records the reference, method, day and payer", async () => {
    currentDoc = doc();
    const res = await patch({ status: "paid", paymentRef: " NEFT-8841 ", paymentMethod: "bank_transfer", paidAt: "2026-09-20" });
    expect(res.status).toBe(200);
    expect(currentDoc).toMatchObject({
      status: "paid", paymentRef: "NEFT-8841", paymentMethod: "bank_transfer", paidBy: "admin_001",
    });
    expect((currentDoc.paidAt as Date).toISOString()).toBe("2026-09-20T12:00:00.000Z");
  });

  it("defaults the payment day to now", async () => {
    currentDoc = doc();
    const before = Date.now();
    await patch({ status: "paid", paymentRef: "CASH-12" });
    expect((currentDoc.paidAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("refuses a payment day in the future", async () => {
    currentDoc = doc();
    const res = await patch({ status: "paid", paymentRef: "X", paidAt: "2999-01-01" });
    expect(res.status).toBe(422);
    expect(currentDoc.save).not.toHaveBeenCalled();
  });

  it.each([{ amount: 1 }, { rate: 5 }, { currency: "INR" }, { type: "override" }])(
    "refuses editing %p on an invoice-generated commission",
    async (edit) => {
      currentDoc = doc({ status: "pending" });
      const res = await patch(edit);
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/comes from an invoice/i);
      expect(currentDoc.save).not.toHaveBeenCalled();
    },
  );

  it("still lets notes be edited on an invoice-generated commission", async () => {
    currentDoc = doc({ status: "paid" });
    const res = await patch({ notes: "Paid with the September batch" });
    expect(res.status).toBe(200);
    expect(currentDoc.notes).toBe("Paid with the September batch");
  });
});
