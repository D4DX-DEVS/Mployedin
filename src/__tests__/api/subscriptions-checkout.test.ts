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
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 }),
  RATE_LIMIT_CONFIGS: { checkout: { limit: 5, windowSec: 60 } },
}));
jest.mock("@/lib/subscription/invoiceNumber", () => ({ generateInvoiceNumber: jest.fn().mockResolvedValue("INV-202609-00001") }));

const startInvoiceCheckout = jest.fn();
jest.mock("@/lib/payments/checkout", () => ({ startInvoiceCheckout: (...a: unknown[]) => startInvoiceCheckout(...a) }));
const applyPaidInvoiceToSubscription = jest.fn();
jest.mock("@/lib/payments/subscriptionFulfillment", () => ({
  applyPaidInvoiceToSubscription: (...a: unknown[]) => applyPaidInvoiceToSubscription(...a),
}));

const DAY = 86_400_000;
const PLAN_ID = "507f1f77bcf86cd799439099";
const gold = { _id: PLAN_ID, name: "Gold", tier: 2, price: 600, currency: "AED", billingCycle: "monthly", targetRole: "employer", isActive: true };
const silver = { _id: "507f1f77bcf86cd799439098", name: "Silver", tier: 1, price: 300, currency: "AED", billingCycle: "monthly", targetRole: "employer", isActive: true };

let plan: Record<string, unknown> = gold;
let currentSub: Record<string, unknown> | null = null;
const invoiceCreate = jest.fn(async (doc: Record<string, unknown>) => ({ _id: "invNew", ...doc, save: jest.fn() }));

jest.mock("@/models/SubscriptionPlan", () => ({ __esModule: true, default: { findOne: jest.fn(() => ({ lean: async () => plan })) } }));
jest.mock("@/models/Subscription", () => ({ __esModule: true, default: { findOne: jest.fn(async () => currentSub) } }));
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ sort: async () => [] })),
    findOne: jest.fn(() => ({ sort: async () => null })),
    create: (doc: Record<string, unknown>) => invoiceCreate(doc),
    updateMany: jest.fn(),
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, User: { findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ name: "Owner", email: "o@acme.test" }) }) })) } }));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: "emp1", companyName: "Acme", companyEmail: "billing@acme.test" }) }) })) } }));

const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

async function post(planId = PLAN_ID) {
  const { POST } = await import("@/app/api/subscriptions/checkout/route");
  return POST(
    new NextRequest("http://localhost:3889/api/subscriptions/checkout", {
      method: "POST", body: JSON.stringify({ planId }), headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({}) },
  );
}

function activeSilver() {
  return {
    _id: "sub1", userId: "owner_1", planId: silver._id, status: "active",
    startDate: new Date(Date.now() - 10 * DAY), endDate: new Date(Date.now() + 20 * DAY),
    planSnapshot: { name: "Silver", tier: 1, price: 300, currency: "AED" },
    save: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  plan = gold;
  currentSub = null;
  process.env.PAYMENT_PROVIDER = "stripe";
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  auth.mockResolvedValue({ user: { id: "owner_1", role: "employer", locale: "en" } });
  startInvoiceCheckout.mockResolvedValue({ checkoutUrl: "https://checkout.stripe.com/c/x", sessionId: "cs_1", provider: "stripe", amount: 400, currency: "AED", reused: false });
});

afterAll(() => {
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
});

describe("POST /api/subscriptions/checkout", () => {
  it("keeps the 503 contract when no gateway is configured", async () => {
    delete process.env.PAYMENT_PROVIDER;
    const res = await post();
    expect(res.status).toBe(503);
    expect((await res.json())).toMatchObject({ error: "payment_gateway_not_configured", plan: { name: "Gold" } });
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("upgrade: creates a prorated pending invoice and does NOT touch the subscription before payment", async () => {
    const sub = activeSilver();
    currentSub = sub;
    const res = await post();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ checkoutUrl: "https://checkout.stripe.com/c/x", invoiceId: "invNew" });
    expect(invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({
      type: "upgrade", planId: PLAN_ID, subscriptionId: "sub1", activationPending: true, status: "issued",
      // 300 × 20/30 unused ≈ 200 credit → ≈ 400 (ms elapsed during the test shave a cent)
      subtotal: expect.closeTo(400, 0), prorationCredit: expect.closeTo(200, 0), currency: "AED", employerId: "emp1",
    }));
    expect(sub.planId).toBe(silver._id); // unchanged until paid
    expect(sub.save).not.toHaveBeenCalled();
    expect(applyPaidInvoiceToSubscription).not.toHaveBeenCalled();
    expect(startInvoiceCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "invNew" }),
      expect.objectContaining({ purpose: "subscription_change", returnPath: "/employer/subscription", customerEmail: "billing@acme.test" }),
    );
  });

  it("new purchase: full price, type new", async () => {
    await post();
    expect(invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({ type: "new", subtotal: 600, activationPending: true }));
  });

  it("downgrade: schedules pendingPlanChange at period end, charges nothing", async () => {
    const sub = { ...activeSilver(), planId: gold._id, planSnapshot: { name: "Gold", tier: 2, price: 600, currency: "AED" } };
    currentSub = sub;
    plan = silver;
    const res = await post(silver._id);
    const json = await res.json();
    expect(json).toMatchObject({ scheduled: true, planName: "Silver" });
    expect((sub as Record<string, unknown>).pendingPlanChange).toMatchObject({ planId: silver._id, effectiveAt: sub.endDate });
    expect(sub.save).toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(startInvoiceCheckout).not.toHaveBeenCalled();
  });

  it("already on the plan → 400", async () => {
    currentSub = { ...activeSilver(), planId: PLAN_ID };
    expect((await post()).status).toBe(400);
  });

  it("job seekers and employers only", async () => {
    auth.mockResolvedValue({ user: { id: "a1", role: "agent", locale: "en" } });
    expect((await post()).status).toBe(403);
  });
});
