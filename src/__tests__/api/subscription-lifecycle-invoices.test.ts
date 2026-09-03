/**
 * @jest-environment node
 *
 * Regression cover for two lifecycle defects found in the subscription audit:
 *
 * 1. Subscription invoices were created with `amount` only. Invoice's pre-save
 *    hook derives `totalAmount`/`amount` from `subtotal`, so every admin-issued
 *    invoice was written as 0.00 regardless of plan price.
 * 2. POST /api/subscriptions/change reassigned `subscription.planId` before
 *    building the history row, so every upgrade/downgrade stored
 *    fromPlanId === toPlanId and the plan-change trail was unusable.
 */

import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: connectDB,
  connectDB,
}));

jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));

jest.mock("@/lib/permissions/matrix", () => ({
  canAccess: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/subscription/invoiceNumber", () => ({
  generateInvoiceNumber: jest.fn().mockResolvedValue("INV-202609-00001"),
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx: { userId: string; role: string }) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/agentRestrictions", () => ({
  requireSubscriptionTargetAccess: jest.fn().mockResolvedValue(null),
}));

const planFindByIdLean = jest.fn();
const userFindByIdLean = jest.fn();
const subscriptionFindOneLean = jest.fn();
const subscriptionFindOne = jest.fn();
const subscriptionFindById = jest.fn();
const subscriptionCreate = jest.fn();
const historyCreate = jest.fn();
const invoiceCreate = jest.fn();

jest.mock("@/models/SubscriptionPlan", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ lean: planFindByIdLean })) },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  User: { findById: jest.fn(() => ({ lean: userFindByIdLean })) },
  default: { findById: jest.fn(() => ({ lean: userFindByIdLean })) },
}));

jest.mock("@/models/Subscription", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn((...args: unknown[]) => {
      const direct = subscriptionFindOne(...args);
      return direct ?? { lean: subscriptionFindOneLean };
    }),
    findById: jest.fn((...args: unknown[]) => subscriptionFindById(...args)),
    create: jest.fn((payload: unknown) => subscriptionCreate(payload)),
  },
}));

jest.mock("@/models/SubscriptionHistory", () => ({
  __esModule: true,
  default: { create: jest.fn((payload: unknown) => historyCreate(payload)) },
}));

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: { create: jest.fn((payload: unknown) => invoiceCreate(payload)) },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOneAndUpdate: jest.fn().mockResolvedValue(null) },
  default: { findOneAndUpdate: jest.fn().mockResolvedValue(null) },
}));

 
const { auth } = require("@/lib/auth/config") as { auth: jest.Mock };

/** Next 15 route handlers always receive a context whose params is a Promise. */
const ROUTE_CTX = { params: Promise.resolve({}) };

const ADMIN = { user: { id: "507f1f77bcf86cd799439001", role: "admin", locale: "en" } };
const USER_ID = "507f1f77bcf86cd799439002";
const OLD_PLAN_ID = "507f1f77bcf86cd799439010";
const NEW_PLAN_ID = "507f1f77bcf86cd799439011";

const goldPlan = {
  _id: NEW_PLAN_ID,
  name: "Gold",
  targetRole: "employer",
  tier: 2,
  price: 1499,
  currency: "AED",
  billingCycle: "monthly",
  isActive: true,
  employerLimits: { maxActiveJobs: 50 },
};

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue(ADMIN);
  subscriptionFindOne.mockReturnValue(undefined);
  subscriptionCreate.mockImplementation(async (payload: Record<string, unknown>) => ({
    _id: "507f1f77bcf86cd799439020",
    ...payload,
  }));
  historyCreate.mockResolvedValue({});
  invoiceCreate.mockImplementation(async (payload: Record<string, unknown>) => payload);
});

describe("POST /api/subscriptions/assign", () => {
  test("bills the invoice at the plan price via subtotal", async () => {
    planFindByIdLean.mockResolvedValue(goldPlan);
    userFindByIdLean.mockResolvedValue({ _id: USER_ID, role: "employer" });
    subscriptionFindOneLean.mockResolvedValue(null); // no existing active sub

    const { POST } = await import("@/app/api/subscriptions/assign/route");
    const res = await POST(
      new NextRequest("http://localhost:3888/api/subscriptions/assign", {
        method: "POST",
        body: JSON.stringify({ userId: USER_ID, planId: NEW_PLAN_ID }),
        headers: { "Content-Type": "application/json" },
      }),
      ROUTE_CTX,
    );

    expect(res.status).toBe(201);
    expect(invoiceCreate).toHaveBeenCalledTimes(1);
    const invoice = invoiceCreate.mock.calls[0][0];
    // Invoice.pre("save") recomputes totalAmount/amount from subtotal — without
    // subtotal the stored invoice totals 0 no matter what `amount` says.
    expect(invoice.subtotal).toBe(1499);
    expect(invoice.amount).toBe(1499);
  });
});

describe("POST /api/subscriptions/change", () => {
  function activeSubscription() {
    return {
      _id: "507f1f77bcf86cd799439020",
      userId: USER_ID,
      targetRole: "employer",
      planId: OLD_PLAN_ID,
      planSnapshot: { name: "Silver", tier: 1, billingCycle: "monthly" },
      save: jest.fn().mockResolvedValue(undefined),
    };
  }

  test("records the previous plan id in history, not the new one", async () => {
    const sub = activeSubscription();
    subscriptionFindOne.mockReturnValue(Promise.resolve(sub));
    planFindByIdLean.mockResolvedValue(goldPlan);

    const { POST } = await import("@/app/api/subscriptions/change/route");
    const res = await POST(
      new NextRequest("http://localhost:3888/api/subscriptions/change", {
        method: "POST",
        body: JSON.stringify({ userId: USER_ID, newPlanId: NEW_PLAN_ID }),
        headers: { "Content-Type": "application/json" },
      }),
      ROUTE_CTX,
    );

    expect(res.status).toBe(200);
    expect(historyCreate).toHaveBeenCalledTimes(1);
    const history = historyCreate.mock.calls[0][0];
    expect(history.action).toBe("upgraded");
    expect(String(history.fromPlanId)).toBe(OLD_PLAN_ID);
    expect(String(history.toPlanId)).toBe(NEW_PLAN_ID);
    expect(String(history.fromPlanId)).not.toBe(String(history.toPlanId));
  });

  test("bills the change invoice at the new plan price via subtotal", async () => {
    const sub = activeSubscription();
    subscriptionFindOne.mockReturnValue(Promise.resolve(sub));
    planFindByIdLean.mockResolvedValue(goldPlan);

    const { POST } = await import("@/app/api/subscriptions/change/route");
    await POST(
      new NextRequest("http://localhost:3888/api/subscriptions/change", {
        method: "POST",
        body: JSON.stringify({ userId: USER_ID, newPlanId: NEW_PLAN_ID }),
        headers: { "Content-Type": "application/json" },
      }),
      ROUTE_CTX,
    );

    const invoice = invoiceCreate.mock.calls[0][0];
    expect(invoice.subtotal).toBe(1499);
    expect(invoice.amount).toBe(1499);
  });
});

describe("POST /api/subscriptions/renew", () => {
  test("bills the renewal invoice at the snapshot price via subtotal", async () => {
    const sub = {
      _id: "507f1f77bcf86cd799439020",
      userId: { toString: () => USER_ID },
      targetRole: "employer",
      planId: OLD_PLAN_ID,
      status: "expired",
      endDate: new Date("2026-08-01T00:00:00.000Z"),
      planSnapshot: { name: "Silver", price: 499, currency: "AED", billingCycle: "monthly" },
      usage: {},
      usageResetAt: new Date(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    subscriptionFindById.mockResolvedValue(sub);

    const { POST } = await import("@/app/api/subscriptions/renew/route");
    const res = await POST(
      new NextRequest("http://localhost:3888/api/subscriptions/renew", {
        method: "POST",
        body: JSON.stringify({ subscriptionId: "507f1f77bcf86cd799439020" }),
        headers: { "Content-Type": "application/json" },
      }),
      ROUTE_CTX,
    );

    expect(res.status).toBe(200);
    const invoice = invoiceCreate.mock.calls[0][0];
    expect(invoice.subtotal).toBe(499);
    expect(invoice.amount).toBe(499);
    expect(sub.status).toBe("active");
  });
});
