import {
  billingCurrency, compareRows, isFreeSubscription, percentUsed, planMove, sortPlans,
  usageLevel, usageRows, visibleInvoices,
} from "@/components/subscription/planBillingModel";
import type { AvailablePlan, MySubscription } from "@/hooks/useSubscription";
import type { InvoiceItem } from "@/hooks/useInvoices";

const plan = (over: Partial<AvailablePlan>): AvailablePlan => ({
  _id: "p", name: "P", slug: "p", targetRole: "employer", tier: 0, price: 0, currency: "AED",
  billingCycle: "monthly", isDefault: false, sortOrder: 0, ...over,
});

const sub = (over: Partial<MySubscription>): MySubscription => ({
  _id: "s", userId: "u", targetRole: "employer", planId: "p",
  planSnapshot: { name: "Silver", tier: 1, price: 199, currency: "AED", billingCycle: "monthly",
    employerLimits: { maxActiveJobs: 10, maxApplicationsViewPerMonth: 100, maxTeamMembers: -1 } },
  status: "active", startDate: "", endDate: "", autoRenew: true,
  usage: { activeJobs: 3, applicationsViewed: 85, aiUsage: {} }, usageResetAt: "",
  liveUsage: { activeJobs: 9, teamMembers: 2 }, createdAt: "", updatedAt: "", ...over,
});

describe("planBillingModel", () => {
  it("uses live job and seat counts, not the period counter", () => {
    const rows = usageRows("employer", sub({}));
    expect(rows.map((r) => [r.key, r.used, r.max])).toEqual([
      ["activeJobs", 9, 10], ["appsViewed", 85, 100], ["teamSeats", 2, -1],
    ]);
  });

  it("calls 80%+ near, at-or-over the limit full, unlimited never", () => {
    expect(usageLevel({ key: "appsViewed", used: 85, max: 100 })).toBe("near");
    expect(usageLevel({ key: "appsViewed", used: 100, max: 100 })).toBe("full");
    expect(usageLevel({ key: "teamSeats", used: 500, max: -1 })).toBe("ok");
    expect(percentUsed({ key: "teamSeats", used: 5, max: 0 })).toBe(0);
  });

  it("reads job-seeker applications from applicationsSubmitted", () => {
    const s = sub({ targetRole: "job_seeker", planSnapshot: { name: "Free", tier: 0, price: 0, currency: "AED", billingCycle: "monthly", jobSeekerLimits: { maxApplicationsPerMonth: 10 } }, usage: { applicationsSubmitted: 4, aiUsage: {} } });
    expect(usageRows("job_seeker", s)).toEqual([{ key: "applications", used: 4, max: 10 }]);
    expect(isFreeSubscription(s)).toBe(true);
  });

  it("hides zero-amount invoices so free users never see 'overdue' bills", () => {
    const inv = (amount: number) => ({ _id: String(amount), amount }) as unknown as InvoiceItem;
    expect(visibleInvoices([inv(0), inv(199)]).map((i) => i.amount)).toEqual([199]);
  });

  it("labels prices in the currency most plans use", () => {
    expect(billingCurrency([plan({ currency: "AED" }), plan({ currency: "aed" }), plan({ currency: "INR" })])).toBe("AED");
  });

  it("orders plans by tier and tells up from down", () => {
    const sorted = sortPlans([plan({ _id: "g", tier: 2 }), plan({ _id: "f", tier: 0 }), plan({ _id: "s", tier: 1 })]);
    expect(sorted.map((p) => p._id)).toEqual(["f", "s", "g"]);
    expect(planMove(sorted[2], "s", 1)).toBe("up");
    expect(planMove(sorted[0], "s", 1)).toBe("down");
    expect(planMove(sorted[1], "s", 1)).toBe("current");
  });

  it("shows unlimited, numbers and missing features distinctly", () => {
    const rows = compareRows("employer");
    const jobs = rows.find((r) => r.key === "fJobs")!;
    expect(jobs.cell(plan({ employerLimits: { maxActiveJobs: -1 } as AvailablePlan["employerLimits"] }))).toEqual({ kind: "unlimited" });
    expect(jobs.cell(plan({ employerLimits: { maxActiveJobs: 10 } as AvailablePlan["employerLimits"] }))).toEqual({ kind: "text", value: 10 });
    const exp = rows.find((r) => r.key === "fExport")!;
    expect(exp.cell(plan({ employerLimits: { dataExport: false } as AvailablePlan["employerLimits"] }))).toEqual({ kind: "no" });
  });
});
