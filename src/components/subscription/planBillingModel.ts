/**
 * Pure helpers behind the Plan & billing page (employer + job seeker).
 * Kept free of React so the rules are unit-tested directly.
 */
import type { AvailablePlan, MySubscription } from "@/hooks/useSubscription";
import type { InvoiceItem } from "@/hooks/useInvoices";

export type CustomerRole = "employer" | "job_seeker";

/** -1 means unlimited in plan limits. */
export const UNLIMITED = -1;

export interface UsageRow {
  key: "activeJobs" | "appsViewed" | "teamSeats" | "applications";
  used: number;
  /** -1 = unlimited, 0 = none allowed. */
  max: number;
}

export function usageRows(role: CustomerRole, sub: MySubscription): UsageRow[] {
  const snap = sub.planSnapshot;
  if (role === "employer") {
    const l = (snap?.employerLimits ?? {}) as Record<string, number | undefined>;
    return [
      { key: "activeJobs", used: sub.liveUsage?.activeJobs ?? sub.usage?.activeJobs ?? 0, max: l.maxActiveJobs ?? 0 },
      { key: "appsViewed", used: sub.usage?.applicationsViewed ?? 0, max: l.maxApplicationsViewPerMonth ?? 0 },
      { key: "teamSeats", used: sub.liveUsage?.teamMembers ?? 0, max: l.maxTeamMembers ?? 0 },
    ];
  }
  const l = (snap?.jobSeekerLimits ?? {}) as Record<string, number | undefined>;
  return [{ key: "applications", used: sub.usage?.applicationsSubmitted ?? 0, max: l.maxApplicationsPerMonth ?? 0 }];
}

/** Share of a limit used, 0–100. Unlimited and zero-limit rows report 0. */
export function percentUsed(row: UsageRow): number {
  if (row.max === UNLIMITED || row.max <= 0) return 0;
  return Math.min(100, Math.round((row.used / row.max) * 100));
}

export type UsageLevel = "ok" | "near" | "full";
export function usageLevel(row: UsageRow): UsageLevel {
  const pct = percentUsed(row);
  if (row.max !== UNLIMITED && row.max > 0 && row.used >= row.max) return "full";
  return pct >= 80 ? "near" : "ok";
}

/** Plans shown in the comparison, cheapest first, then by tier. */
export function sortPlans(plans: AvailablePlan[]): AvailablePlan[] {
  return [...plans].sort((a, b) => a.tier - b.tier || a.sortOrder - b.sortOrder || a.price - b.price);
}

/**
 * The billing currency the comparison is labelled in. When plans disagree
 * (a data mistake the admin page flags) the most common one wins.
 */
export function billingCurrency(plans: AvailablePlan[]): string {
  const counts = new Map<string, number>();
  for (const p of plans) {
    const c = (p.currency || "AED").toUpperCase();
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = "AED";
  let bestCount = 0;
  for (const [c, n] of counts) if (n > bestCount) { best = c; bestCount = n; }
  return best;
}

export type PlanMove = "current" | "up" | "down";
export function planMove(plan: AvailablePlan, currentPlanId: string | undefined, currentTier: number): PlanMove {
  if (currentPlanId && plan._id === currentPlanId) return "current";
  return plan.tier > currentTier ? "up" : "down";
}

/** A paid subscription renews; a free one has no end customers care about. */
export function isFreeSubscription(sub: MySubscription): boolean {
  return !(Number(sub.planSnapshot?.price) > 0);
}

/**
 * Invoices a customer should see. Free-plan invoices are 0.00 records the
 * system wrote on assignment; showing them listed free users as "overdue".
 */
export function visibleInvoices(invoices: InvoiceItem[]): InvoiceItem[] {
  return invoices.filter((inv) => Number(inv.amount) > 0);
}

export type CompareCell = { kind: "yes" } | { kind: "no" } | { kind: "text"; value: string | number } | { kind: "unlimited" };

export interface CompareRow {
  key: string;
  cell: (plan: AvailablePlan) => CompareCell;
}

const yesNo = (v: unknown): CompareCell => (v ? { kind: "yes" } : { kind: "no" });
const limit = (v: unknown): CompareCell => {
  const n = Number(v ?? 0);
  if (n === UNLIMITED) return { kind: "unlimited" };
  if (n <= 0) return { kind: "no" };
  return { kind: "text", value: n };
};
const aiCount = (features: { enabled: boolean }[] | undefined): CompareCell => {
  const n = (features ?? []).filter((f) => f.enabled).length;
  return n > 0 ? { kind: "text", value: n } : { kind: "no" };
};

export function compareRows(role: CustomerRole): CompareRow[] {
  if (role === "employer") {
    return [
      { key: "fJobs", cell: (p) => limit(p.employerLimits?.maxActiveJobs) },
      { key: "fApps", cell: (p) => limit(p.employerLimits?.maxApplicationsViewPerMonth) },
      { key: "fSeats", cell: (p) => limit(p.employerLimits?.maxTeamMembers) },
      { key: "fAi", cell: (p) => aiCount(p.employerLimits?.aiFeatures) },
      {
        key: "fAnalytics",
        cell: (p) => {
          const lvl = p.employerLimits?.analyticsLevel ?? "none";
          return lvl === "none" ? { kind: "no" } : { kind: "text", value: lvl };
        },
      },
      { key: "fExport", cell: (p) => yesNo(p.employerLimits?.dataExport) },
      { key: "fTemplates", cell: (p) => yesNo(p.employerLimits?.commTemplates) },
      { key: "fScorecards", cell: (p) => yesNo(p.employerLimits?.scorecardEvaluations) },
      { key: "fFeatured", cell: (p) => limit(p.employerLimits?.featuredJobListings) },
      { key: "fBranded", cell: (p) => yesNo(p.employerLimits?.brandedCompanyPage) },
      { key: "fSupport", cell: (p) => yesNo(p.employerLimits?.prioritySupport) },
    ];
  }
  return [
    { key: "fSeekerApps", cell: (p) => limit(p.jobSeekerLimits?.maxApplicationsPerMonth) },
    { key: "fAi", cell: (p) => aiCount(p.jobSeekerLimits?.aiFeatures) },
    { key: "fBoost", cell: (p) => yesNo(p.jobSeekerLimits?.profileVisibilityBoost) },
    { key: "fSalary", cell: (p) => yesNo(p.jobSeekerLimits?.salaryInsights) },
    { key: "fCv", cell: (p) => yesNo(p.jobSeekerLimits?.resumeBuilderAccess) },
    { key: "fPriority", cell: (p) => yesNo(p.jobSeekerLimits?.priorityApplicationReview) },
  ];
}
