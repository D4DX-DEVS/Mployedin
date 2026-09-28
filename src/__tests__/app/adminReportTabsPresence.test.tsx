/**
 * @jest-environment jsdom
 */
/**
 * The report tab strip is the only way across the five admin reports. Two of
 * the pages rendered it inside their loading skeleton only, so it flashed and
 * disappeared the moment data arrived. Every state keeps it now.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AdminTargetReportPage from "@/app/[locale]/(dashboard)/admin/target-report/page";
import AdminSubscriptionDashboardPage from "@/app/[locale]/(dashboard)/admin/subscription-dashboard/page";
import { ADMIN_REPORT_TABS } from "@/lib/nav/reportRoutes";
import { getNavGroups } from "@/lib/nav/menuConfig";

let pathnameMock = "/en/admin/target-report";

jest.mock("next/navigation", () => ({
  usePathname: () => pathnameMock,
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const subscriptionState: { data: unknown; isLoading: boolean; error: unknown } = {
  data: null,
  isLoading: false,
  error: null,
};

jest.mock("@/components/features/subscription-dashboard/useSubscriptionDashboard", () => ({
  useSubscriptionDashboard: () => ({ ...subscriptionState, isFetching: false, refetch: jest.fn() }),
}));

const originalFetch = global.fetch;

function withQueryClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const none = { target: 0, achieved: 0 };
const targetReport = {
  year: 2026,
  years: [2026],
  expectedProgress: 75,
  totals: {
    employers: none,
    employees: none,
    finance: { currency: null, target: 0, achieved: 0, others: [] },
    people: { total: 0, achieved: 0, onPace: 0, behind: 0 },
  },
  monthly: [],
  people: [],
};

const subscriptionReport = {
  period: { key: "30d", days: 30 },
  currency: "AED",
  otherCurrencies: [],
  mrr: 0,
  active: { total: 0, paid: 0, free: 0 },
  trends: { started: { current: 0, previous: 0 }, lost: { current: 0, previous: 0 } },
  plans: [],
  renewals: { within7: 0, within30: 0, paidAutoRenew: 0, paidManual: 0, free: 0, mrrAtRisk: 0 },
  activity: [],
  conversion: { employer: { accounts: 0, verified: 0, paid: 0 }, jobSeeker: { accounts: 0, verified: 0, paid: 0 } },
};

afterEach(() => {
  global.fetch = originalFetch;
});

describe("admin report tab strip", () => {
  it("stays on the target report once its data has loaded", async () => {
    pathnameMock = "/en/admin/target-report";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => targetReport } as Response);

    render(withQueryClient(<AdminTargetReportPage />));

    await screen.findByRole("heading", { level: 1, name: /target report/i });
    const strip = screen.getByRole("navigation", { name: "Reports" });
    expect(strip.querySelector('[aria-current="page"]')?.textContent).toBe("Targets");
  });

  it("keeps the strip and offers a retry when the target report fails", async () => {
    pathnameMock = "/en/admin/target-report";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);

    render(withQueryClient(<AdminTargetReportPage />));

    await screen.findByRole("alert");
    expect(screen.getByRole("navigation", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("stays on the subscription dashboard once its data has loaded, and on its error state", () => {
    pathnameMock = "/en/admin/subscription-dashboard";
    subscriptionState.data = subscriptionReport;
    const { unmount } = render(<AdminSubscriptionDashboardPage />);
    expect(screen.getByRole("navigation", { name: "Reports" })).toBeInTheDocument();
    unmount();

    subscriptionState.data = null;
    subscriptionState.error = new Error("boom");
    render(<AdminSubscriptionDashboardPage />);
    expect(screen.getByRole("navigation", { name: "Reports" })).toBeInTheDocument();
    subscriptionState.error = null;
  });

  it("lights the sidebar's Reports row on every report tab", () => {
    const reports = getNavGroups("admin", "en")
      .flatMap((group) => group.items)
      .find((item) => item.title === "Reports");

    expect(reports?.activePaths).toEqual(ADMIN_REPORT_TABS.map((tab) => `/en${tab.path}`));
  });
});
