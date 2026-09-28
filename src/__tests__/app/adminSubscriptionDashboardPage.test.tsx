/**
 * @jest-environment jsdom
 */
/**
 * The Subscriptions report tab: four totals and four cards, on the Platform
 * tab's layout. It used to stack fourteen sections, several of which were
 * wrong (an alerts strip that counted renewals twice, an invented LTV, an
 * all-time agent table labelled "this month").
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";

import AdminSubscriptionDashboardPage from "@/app/[locale]/(dashboard)/admin/subscription-dashboard/page";

let searchParams = new URLSearchParams();
const hookPeriods: string[] = [];

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/admin/subscription-dashboard",
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => searchParams,
}));

const report = {
  period: { key: "30d", days: 30 },
  currency: "INR",
  otherCurrencies: [{ currency: "USD", count: 3, mrr: 90 }],
  mrr: 12000,
  active: { total: 10, paid: 4, free: 6 },
  trends: {
    started: { current: 5, previous: 2 },
    // More lost than before: bad news, so the badge is rose, not emerald.
    lost: { current: 3, previous: 1 },
  },
  plans: [
    { role: "employer", name: "Platinum", tier: 3, active: 3, paid: 3, mrr: 9000, share: 75 },
    { role: "employer", name: "Free", tier: 0, active: 4, paid: 0, mrr: 0, share: 0 },
    { role: "job_seeker", name: "Premium Plus", tier: 2, active: 1, paid: 1, mrr: 3000, share: 25 },
  ],
  renewals: { within7: 2, within30: 6, paidAutoRenew: 1, paidManual: 2, free: 3, mrrAtRisk: 6000 },
  activity: [
    { month: "2026-08", started: 2, lost: 1 },
    { month: "2026-09", started: 5, lost: 3 },
  ],
  conversion: {
    employer: { accounts: 20, verified: 15, paid: 3 },
    jobSeeker: { accounts: 50, verified: 40, paid: 1 },
  },
};

jest.mock("@/components/features/subscription-dashboard/useSubscriptionDashboard", () => ({
  useSubscriptionDashboard: (period: string) => {
    hookPeriods.push(period);
    return { data: report, isLoading: false, isFetching: false, error: null, refetch: jest.fn() };
  },
}));

beforeEach(() => {
  searchParams = new URLSearchParams();
  hookPeriods.length = 0;
});

describe("AdminSubscriptionDashboardPage", () => {
  it("is four totals and four cards; the old sections are gone", () => {
    render(<AdminSubscriptionDashboardPage />);

    for (const name of ["Plan mix", "Renewals due", "Started and lost", "Paying customers"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    for (const gone of [/revenue health/i, /top customers/i, /top selling agents/i, /recent activity/i, /alerts/i, /revenue by country/i, /invoices/i]) {
      expect(screen.queryByRole("heading", { name: gone })).toBeNull();
    }
  });

  it("formats money in the report currency and names the currencies it left out", () => {
    const { container } = render(<AdminSubscriptionDashboardPage />);

    expect(screen.getByText("₹12,000")).toBeInTheDocument();
    expect(screen.getByText("3 subscriptions are billed in USD: counted, not added in.")).toBeInTheDocument();
    expect(container.textContent).not.toContain("AED");
  });

  it("reads the period from the URL", () => {
    searchParams = new URLSearchParams("period=90d");
    render(<AdminSubscriptionDashboardPage />);

    expect(hookPeriods[0]).toBe("90d");
  });

  it("marks more cancellations as bad news and more sign-ups as good", () => {
    render(<AdminSubscriptionDashboardPage />);
    const totals = screen.getByRole("region", { name: "Subscription totals" });

    expect(within(totals).getByText("+3").closest("span")?.className).toContain("emerald");
    expect(within(totals).getByText("+2").closest("span")?.className).toContain("rose");
  });

  it("links renewal counts to the subscriptions list on the same window", () => {
    render(<AdminSubscriptionDashboardPage />);
    const card = screen.getByRole("region", { name: "Renewals due" });

    expect(within(card).getByText("6").closest("a")?.getAttribute("href")).toBe("/en/admin/subscriptions?expiring=30d");
    expect(within(card).getByText("2 end within 7 days").closest("a")?.getAttribute("href")).toBe("/en/admin/subscriptions?expiring=7d");
    expect(within(card).getByText("₹6,000 a month ends unless renewed")).toBeInTheDocument();
  });

  it("lists each plan once, with free plans named rather than priced", () => {
    render(<AdminSubscriptionDashboardPage />);
    const card = screen.getByRole("region", { name: "Plan mix" });

    expect(within(card).getByText("Platinum")).toBeInTheDocument();
    expect(within(card).getByText("₹9,000")).toBeInTheDocument();
    expect(within(card).getAllByText("Free")).toHaveLength(2);
    expect(within(card).getByText("Manage plans").closest("a")?.getAttribute("href")).toBe("/en/admin/subscription-plans");
  });

  it("measures every funnel stage against the accounts, per customer role", () => {
    const { container } = render(<AdminSubscriptionDashboardPage />);
    const employers = container.querySelector('[data-conversion="employer"]') as HTMLElement;

    expect(within(employers).getByText("Employers")).toBeInTheDocument();
    expect(employers.querySelector('[data-stage="verified"]')?.textContent).toContain("75%");
    expect(employers.querySelector('[data-stage="paid"]')?.textContent).toContain("15%");
  });
});
