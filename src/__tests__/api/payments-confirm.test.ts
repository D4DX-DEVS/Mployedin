/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn() }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const rateLimit = jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 0 });
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: (...a: unknown[]) => rateLimit(...a),
  RATE_LIMIT_CONFIGS: { paymentConfirm: { limit: 10, windowSec: 60 } },
}));

const markInvoicePaid = jest.fn();
jest.mock("@/lib/payments/markInvoicePaid", () => ({ markInvoicePaid: (...a: unknown[]) => markInvoicePaid(...a) }));

const INVOICE_ID = "507f1f77bcf86cd799439061";
const invoice = { _id: INVOICE_ID, userId: "owner_1", invoiceNumber: "INV-1", status: "issued", currency: "AED" };
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: () => ({ lean: async () => invoice }) })),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => invoice }) })),
  },
}));

const fetchMock = jest.fn();
const realFetch = global.fetch;

function stripeSession(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      id: "cs_test_1", status: "complete", payment_status: "paid", amount_total: 60000, currency: "aed",
      client_reference_id: INVOICE_ID, payment_intent: { id: "pi_1", payment_method_types: ["card"] },
      ...overrides,
    }),
  };
}

async function get(query: string) {
  const { GET } = await import("@/app/api/payments/confirm/route");
  return GET(new NextRequest(`http://localhost:3889/api/payments/confirm?${query}`), { params: Promise.resolve({}) });
}

const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PAYMENT_PROVIDER = "stripe";
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  global.fetch = fetchMock as unknown as typeof fetch;
  auth.mockResolvedValue({ user: { id: "owner_1", role: "employer", locale: "en" } });
  markInvoicePaid.mockResolvedValue({ status: "paid", invoiceStatus: "paid", balanceDue: 0, subscription: { status: "applied" } });
});

afterAll(() => {
  global.fetch = realFetch;
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
});

describe("GET /api/payments/confirm", () => {
  it("paid at the provider → records via markInvoicePaid with provider amounts (not client input)", async () => {
    fetchMock.mockResolvedValue(stripeSession());
    const res = await get("session_id=cs_test_1&amount=1");
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ status: "paid", applied: true, invoiceStatus: "paid", subscription: "applied" });
    expect(markInvoicePaid).toHaveBeenCalledWith(INVOICE_ID, expect.objectContaining({
      provider: "stripe", paymentId: "pi_1", amount: 600, currency: "AED", method: "card",
    }));
  });

  it("already recorded by the webhook → still reports paid (idempotent)", async () => {
    fetchMock.mockResolvedValue(stripeSession());
    markInvoicePaid.mockResolvedValue({ status: "already_processed", invoiceStatus: "paid" });
    const json = await (await get("session_id=cs_test_1")).json();
    expect(json).toMatchObject({ status: "paid", applied: true });
  });

  it("async method still settling → pending, nothing recorded", async () => {
    fetchMock.mockResolvedValue(stripeSession({ payment_status: "unpaid", status: "complete" }));
    const json = await (await get("session_id=cs_test_1")).json();
    expect(json.status).toBe("pending");
    expect(markInvoicePaid).not.toHaveBeenCalled();
  });

  it("abandoned / expired session → cancelled", async () => {
    fetchMock.mockResolvedValue(stripeSession({ payment_status: "unpaid", status: "expired" }));
    expect((await (await get("session_id=cs_test_1")).json()).status).toBe("cancelled");
  });

  it("forbids confirming someone else's invoice", async () => {
    auth.mockResolvedValue({ user: { id: "intruder", role: "employer", locale: "en" } });
    fetchMock.mockResolvedValue(stripeSession());
    const res = await get("session_id=cs_test_1");
    expect(res.status).toBe(403);
    expect(markInvoicePaid).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    expect((await get("session_id=cs_test_1")).status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 without a session reference, 503 without a gateway", async () => {
    expect((await get("")).status).toBe(400);
    delete process.env.PAYMENT_PROVIDER;
    expect((await get("session_id=cs_test_1")).status).toBe(503);
  });

  it("provider lookup failure → 502", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: "err", json: async () => ({}) });
    expect((await get("session_id=cs_test_1")).status).toBe(502);
  });
});
