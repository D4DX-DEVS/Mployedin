import { getAdminActionQueue } from "@/lib/admin/actionQueue.server";
import { PAYMENT_NOTICE_PENDING_FILTER, subscriptionsEndingFilter } from "@/lib/admin/queueFilters";
import type { Resource } from "@/types/user";

const counts = {
  exhibition: jest.fn(),
  invoice: jest.fn(),
  commission: jest.fn(),
  gdpr: jest.fn(),
  subscription: jest.fn(),
  conversation: jest.fn(),
  contact: jest.fn(),
  review: jest.fn(),
};
const defaultPlanRoles = jest.fn();
const demandBuckets = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn() } }));
jest.mock("@/models/ExhibitionRequest", () => ({ __esModule: true, default: { countDocuments: (q: unknown) => counts.exhibition(q) } }));
jest.mock("@/models/Invoice", () => ({ __esModule: true, default: { countDocuments: (q: unknown) => counts.invoice(q) } }));
jest.mock("@/models/Commission", () => ({ __esModule: true, default: { countDocuments: (q: unknown) => counts.commission(q) } }));
jest.mock("@/models/GdprRequest", () => ({ __esModule: true, default: { countDocuments: (q: unknown) => counts.gdpr(q) } }));
jest.mock("@/models/Subscription", () => ({ __esModule: true, default: { countDocuments: (q: unknown) => counts.subscription(q) } }));
jest.mock("@/models/Conversation", () => ({ __esModule: true, default: { countDocuments: (q: unknown) => counts.conversation(q) } }));
jest.mock("@/models/ContactSubmission", () => ({ __esModule: true, default: { countDocuments: (q: unknown) => counts.contact(q) } }));
jest.mock("@/models/CompanyReview", () => ({ __esModule: true, default: { countDocuments: (q: unknown) => counts.review(q) } }));
jest.mock("@/models/SubscriptionPlan", () => ({
  __esModule: true,
  default: { distinct: (field: string, q: unknown) => defaultPlanRoles(field, q) },
}));
jest.mock("@/lib/admin/platformAlerts.server", () => ({
  countApplicationsAwaitingReview: jest.fn().mockResolvedValue(7),
}));
jest.mock("@/lib/admin/dashboard/shared.server", () => ({ getJobDemandBuckets: () => demandBuckets() }));

describe("getAdminActionQueue", () => {
  beforeEach(() => {
    Object.values(counts).forEach((mock) => mock.mockReset().mockResolvedValue(0));
    defaultPlanRoles.mockReset().mockResolvedValue(["employer", "job_seeker"]);
    demandBuckets.mockReset().mockResolvedValue({ none: 0, low: 0 });
  });

  it("never queries a resource the admin cannot read", async () => {
    const allowed = new Set<Resource>(["jobs", "applications"]);
    const items = await getAdminActionQueue((resource) => allowed.has(resource));

    expect(counts.invoice).not.toHaveBeenCalled();
    expect(counts.exhibition).not.toHaveBeenCalled();
    expect(counts.conversation).not.toHaveBeenCalled();
    expect(items.map((item) => item.id)).toEqual(["applications-awaiting-review"]);
  });

  it("counts with the same filters the list endpoints apply", async () => {
    counts.invoice.mockImplementation(async (query: Record<string, unknown>) =>
      JSON.stringify(query) === JSON.stringify(PAYMENT_NOTICE_PENDING_FILTER) ? 2 : 0,
    );
    const items = await getAdminActionQueue(() => true);
    expect(items.find((item) => item.id === "payment-notices")?.count).toBe(2);
    expect(counts.exhibition).toHaveBeenCalledWith({ status: "approved" });
  });

  it("drops a row whose counter fails instead of failing the dashboard", async () => {
    counts.gdpr.mockRejectedValue(new Error("boom"));
    counts.commission.mockResolvedValue(3);
    const items = await getAdminActionQueue(() => true);
    expect(items.map((item) => item.id)).toContain("commissions-pending");
    expect(items.map((item) => item.id)).not.toContain("gdpr-pending");
  });
});

describe("new queue items", () => {
  beforeEach(() => {
    Object.values(counts).forEach((mock) => mock.mockReset().mockResolvedValue(0));
    defaultPlanRoles.mockReset().mockResolvedValue(["employer", "job_seeker"]);
    demandBuckets.mockReset().mockResolvedValue({ none: 0, low: 0 });
  });

  it("counts company reviews waiting for moderation", async () => {
    counts.review.mockResolvedValue(3);
    const items = await getAdminActionQueue(() => true);
    expect(counts.review).toHaveBeenCalledWith({ status: "pending" });
    expect(items.find((item) => item.id === "company-reviews-pending")).toMatchObject({
      count: 3,
      path: "/admin/cms/company-reviews?status=pending",
    });
  });

  it("counts each subscribing role that has no active default plan", async () => {
    defaultPlanRoles.mockResolvedValue(["employer"]);
    const items = await getAdminActionQueue(() => true);
    expect(defaultPlanRoles).toHaveBeenCalledWith("targetRole", {
      isActive: true,
      isDefault: true,
      targetRole: { $in: ["employer", "job_seeker"] },
    });
    expect(items.find((item) => item.id === "default-plans-missing")).toMatchObject({ count: 1, level: "critical" });
  });

  it("takes jobs without applications from the shared demand buckets", async () => {
    demandBuckets.mockResolvedValue({ none: 43, low: 22 });
    const items = await getAdminActionQueue(() => true);
    expect(items.find((item) => item.id === "jobs-without-applications")?.count).toBe(43);
  });
});

describe("subscriptionsEndingFilter", () => {
  it("covers active subscriptions ending between now and the window", () => {
    const now = new Date("2026-09-24T00:00:00.000Z");
    expect(subscriptionsEndingFilter(7, now)).toEqual({
      status: "active",
      endDate: { $gte: now, $lte: new Date("2026-10-01T00:00:00.000Z") },
    });
  });
});
