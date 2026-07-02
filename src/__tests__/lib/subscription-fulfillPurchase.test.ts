/**
 * @jest-environment node
 */
import { fulfillSubscriptionPurchase } from "@/lib/subscription/fulfillPurchase";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import Invoice from "@/models/Invoice";
import { User } from "@/models/User";
import { Employer } from "@/models/Employer";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/subscription/invoiceNumber", () => ({
  generateInvoiceNumber: jest.fn().mockResolvedValue("INV-TEST-0001"),
}));

jest.mock("@/models/SubscriptionPlan", () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.mock("@/models/Subscription", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));

jest.mock("@/models/SubscriptionHistory", () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}) },
}));

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn().mockResolvedValue({}) },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  User: { findById: jest.fn() },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOneAndUpdate: jest.fn().mockResolvedValue({}) },
}));

const mockPlanFindById = SubscriptionPlan.findById as jest.Mock;
const mockSubFindOne = Subscription.findOne as jest.Mock;
const mockSubCreate = Subscription.create as jest.Mock;
const mockInvoiceFindOne = Invoice.findOne as jest.Mock;
const mockInvoiceCreate = Invoice.create as jest.Mock;
const mockHistoryCreate = SubscriptionHistory.create as jest.Mock;
const mockUserFindById = User.findById as jest.Mock;
const mockEmployerUpdate = Employer.findOneAndUpdate as jest.Mock;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const plan = {
  _id: "plan1",
  name: "Gold",
  tier: 2,
  price: 199,
  currency: "AED",
  billingCycle: "monthly",
  targetRole: "employer",
  isActive: true,
  employerLimits: { maxActiveJobs: 50 },
};

const input = {
  userId: "user1",
  planId: "plan1",
  paymentId: "pay_ABC123",
  provider: "stripe" as const,
  amount: 199,
  currency: "AED",
};

function chainLean(value: unknown) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function chainSelectLean(value: unknown) {
  return { select: jest.fn(() => chainLean(value)) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoiceFindOne.mockReturnValue(chainSelectLean(null));
  mockPlanFindById.mockReturnValue(chainLean(plan));
  mockUserFindById.mockReturnValue(chainSelectLean({ _id: "user1", role: "employer" }));
  mockSubFindOne.mockResolvedValue(null);
  mockSubCreate.mockResolvedValue({ _id: "sub1" });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("fulfillSubscriptionPurchase", () => {
  it("creates subscription + PAID invoice on new purchase", async () => {
    const result = await fulfillSubscriptionPurchase(input);

    expect(result.status).toBe("fulfilled");
    expect(result.invoiceNumber).toBe("INV-TEST-0001");

    expect(mockSubCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user1", planId: "plan1", status: "active" }),
    );
    expect(mockHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "assigned" }),
    );
    expect(mockInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "new",
        status: "paid",
        paidAmount: 199,
        balanceDue: 0,
        payments: [expect.objectContaining({ referenceNumber: "pay_ABC123" })],
      }),
    );
    expect(mockEmployerUpdate).toHaveBeenCalled();
  });

  it("is idempotent — same paymentId does not double-fulfill", async () => {
    mockInvoiceFindOne.mockReturnValue(
      chainSelectLean({ invoiceNumber: "INV-TEST-0001", subscriptionId: "sub1" }),
    );

    const result = await fulfillSubscriptionPurchase(input);

    expect(result.status).toBe("already_processed");
    expect(mockSubCreate).not.toHaveBeenCalled();
    expect(mockInvoiceCreate).not.toHaveBeenCalled();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
  });

  it("upgrades an existing active subscription and issues upgrade invoice", async () => {
    const activeSub = {
      _id: "sub1",
      planSnapshot: { tier: 0, name: "Basic" },
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockSubFindOne.mockResolvedValue(activeSub);

    const result = await fulfillSubscriptionPurchase(input);

    expect(result.status).toBe("fulfilled");
    expect(activeSub.save).toHaveBeenCalled();
    expect(mockSubCreate).not.toHaveBeenCalled();
    expect(mockHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "upgraded", fromPlanName: "Basic" }),
    );
    expect(mockInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "upgrade", status: "paid" }),
    );
  });

  it("returns error when user role does not match plan targetRole", async () => {
    mockUserFindById.mockReturnValue(chainSelectLean({ _id: "user1", role: "job_seeker" }));

    const result = await fulfillSubscriptionPurchase(input);

    expect(result.status).toBe("error");
    expect(mockInvoiceCreate).not.toHaveBeenCalled();
  });
});
