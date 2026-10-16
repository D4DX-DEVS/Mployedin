/**
 * @jest-environment jsdom
 */
/**
 * The Targets report tab: four profit totals, monthly profit beside who is
 * behind pace, where the profit came from, then every target as a report card
 * (completion status, growth, target bar, period bars) that opens into the
 * full report, each super agent's agents underneath.
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AdminTargetReportPage from "@/app/[locale]/(dashboard)/admin/target-report/page";

let searchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/admin/target-report",
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => searchParams,
}));

const insights = (status: string, overrides: Record<string, unknown> = {}) => ({
  status,
  remaining: 500,
  timeline: { startDate: "2026-01-01", endDate: "2026-12-31", daysTotal: 365, daysElapsed: 274, daysLeft: 91, daysToStart: 0 },
  forecast: { profit: 700, progress: 70 },
  yearOverYear: { previous: 400, pct: 25, trend: "up" },
  momentum: null,
  ...overrides,
});

const quarters = [
  { startDate: "2026-01-01", endDate: "2026-03-31", profitTarget: 250, profitAchieved: 250, profitProgress: 100, status: "past" },
  { startDate: "2026-04-01", endDate: "2026-06-30", profitTarget: 250, profitAchieved: 100, profitProgress: 40, status: "past" },
  { startDate: "2026-07-01", endDate: "2026-09-30", profitTarget: 250, profitAchieved: 0, profitProgress: 0, status: "current" },
  { startDate: "2026-10-01", endDate: "2026-12-31", profitTarget: 250, profitAchieved: 0, profitProgress: 0, status: "upcoming" },
];

const person = (overrides: Record<string, unknown>) => ({
  email: "",
  userId: "u",
  parentProfileId: null,
  role: "agent",
  region: null,
  currency: "INR",
  profitTarget: 1000,
  profitAchieved: 500,
  expectedProgress: 75,
  incentiveTier: "none",
  periodType: "quarterly",
  periods: quarters,
  insights: insights("onPace"),
  ...overrides,
});

/** One person's full report, as `?profileId=` returns it. */
const fullReport = {
  year: 2026,
  currency: "INR",
  person: { profileId: "p-low", userId: "u", name: "Sam Stalled", email: "sam@example.com", role: "agent", region: null },
  summary: {
    profitTarget: 1000, profitAchieved: 100, profitPending: 900, profitProgress: 10, expectedProgress: 75,
    riskScore: "high", incentiveTier: "none", pace: "behind", insights: insights("behind"),
  },
  months: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1, profitTarget: 80, profitAchieved: 0, revenue: 0, commissionCost: 0, invoicesPaid: 0, placements: 0, newEmployers: 0,
  })),
  drivers: { profit: 100, revenue: 150, commissionCost: 50, invoicesPaid: 2, placements: 1, newEmployers: 0 },
  byCategory: [],
  previousYear: { year: 2025, profit: 400, growthPct: -75 },
  schedule: { periodType: "quarterly", periods: quarters },
};

const report = {
  year: 2026,
  years: [2027, 2026],
  expectedProgress: 75,
  totals: {
    profit: { currency: "INR", target: 100000, achieved: 25000, others: [{ currency: "AED", target: 5000, achieved: 0 }] },
    drivers: { revenue: 40000, commissionCost: 15000, invoicesPaid: 12, placements: 7, newEmployers: 3 },
    people: { total: 4, achieved: 1, onPace: 1, behind: 2, notStarted: 0 },
  },
  monthly: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    target: 8000,
    achieved: index < 3 ? 2000 : 0,
  })),
  byCategory: [
    { category: "recruitment", profit: 20000, share: 80 },
    { category: "subscription", profit: 5000, share: 20 },
  ],
  people: [
    person({ id: "p-top", name: "Amira Top", role: "super_agent", region: "Dubai", progress: 110, pace: "achieved", incentiveTier: "platinum", insights: insights("achieved", { remaining: 0 }) }),
    person({ id: "p-ok", name: "Omar Steady", progress: 80, pace: "onPace", parentProfileId: "p-top" }),
    person({ id: "p-mid", name: "Lina Slow", progress: 50, pace: "behind", parentProfileId: "p-top", insights: insights("behind", { yearOverYear: { previous: 600, pct: -17, trend: "down" } }) }),
    person({ id: "p-low", name: "Sam Stalled", email: "sam@example.com", progress: 10, pace: "behind", insights: insights("behind", { yearOverYear: { previous: 0, pct: null, trend: "new" } }) }),
  ],
};

const originalFetch = global.fetch;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminTargetReportPage /></QueryClientProvider>);
}

/** The list for the year, or one person's full report when `?profileId=` is asked for. */
function mockApi(list: unknown = report) {
  global.fetch = jest.fn().mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes("profileId=") ? { report: fullReport } : list),
  } as Response));
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockApi();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("AdminTargetReportPage", () => {
  it("is four totals, a chart, who is behind, where the profit came from and one list of target reports", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "Monthly profit" });
    expect(screen.getByRole("heading", { name: "Behind pace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where the profit comes from" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Target reports" })).toBeInTheDocument();
    for (const gone of [/business volume/i, /year-over-year/i, /quarterly/i, /employers/i, /employees/i]) {
      expect(screen.queryByRole("heading", { name: gone })).toBeNull();
    }
  });

  it("asks for no year when the URL has none, and shows the year the API opened on", async () => {
    mockApi({ ...report, year: 2027, years: [2027, 2026] });
    renderPage();

    await screen.findByRole("heading", { name: "Monthly profit" });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/admin/target-report");
    expect(screen.getByRole("combobox", { name: "Target year" })).toHaveTextContent("2027");
    expect(screen.getByText("2027 profit targets for super agents and agents, against the profit they brought in.")).toBeInTheDocument();
  });

  it("asks the API for the year in the URL", async () => {
    searchParams = new URLSearchParams("year=2027");
    renderPage();

    await screen.findByRole("heading", { name: "Monthly profit" });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/admin/target-report?year=2027");
  });

  it("shows profit in its own currency and names the currencies it left out", async () => {
    renderPage();
    const totals = await screen.findByRole("region", { name: "Target totals" });

    expect(within(totals).getByText("₹25,000")).toBeInTheDocument();
    expect(within(totals).getByText("Net income after commissions, of a ₹100,000 target")).toBeInTheDocument();
    expect(within(totals).getByText("+ 1 other currency, not added in")).toBeInTheDocument();
    // Revenue before commissions, and what the commissions cost.
    expect(within(totals).getByText("₹40,000")).toBeInTheDocument();
    expect(within(totals).getByText("₹15,000")).toBeInTheDocument();
    expect(within(totals).getByText("38% of revenue")).toBeInTheDocument();
    expect(within(totals).getByText("2 behind")).toBeInTheDocument();
  });

  it("lists only the people behind pace, furthest behind first, each opening their plan", async () => {
    renderPage();
    const card = await screen.findByRole("region", { name: "Behind pace" });
    const links = within(card).getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("/target-management/p-"));

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/en/admin/target-management/p-low",
      "/en/admin/target-management/p-mid",
    ]);
    expect(within(card).getByText("Open target management").closest("a")?.getAttribute("href")).toBe("/en/admin/target-management?year=2026");
  });

  it("says nothing is due yet for a future year instead of listing no one", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...report, expectedProgress: 0, people: report.people.map((row) => ({ ...row, pace: "onPace" })) }),
    } as Response);
    renderPage();
    const card = await screen.findByRole("region", { name: "Behind pace" });

    expect(within(card).getByText("Nothing of 2026 is due yet, so nobody can be behind.")).toBeInTheDocument();
  });

  it("charts profit against target in the one currency", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Monthly profit" });

    expect(screen.getByRole("img", { name: "Profit target and profit achieved per month in 2026" })).toBeInTheDocument();
    expect(screen.getByText("Amounts in INR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finance" })).toBeNull();
  });

  it("splits the profit by the kind of invoice it came from", async () => {
    renderPage();
    const card = await screen.findByRole("region", { name: "Where the profit comes from" });

    expect(within(card).getByText("Recruitment")).toBeInTheDocument();
    expect(within(card).getByText("Subscriptions")).toBeInTheDocument();
    expect(within(card).getByText(/80%/)).toBeInTheDocument();
  });

  describe("target report cards", () => {
    const list = async () => screen.findByRole("region", { name: "Target reports" });

    it("shows each super agent's agents right under them", async () => {
      renderPage();
      const section = await list();
      const names = within(section).getAllByRole("link").map((link) => link.textContent);

      // Amira (super agent), then her agents by progress, then the agent with no parent.
      expect(names).toEqual(["Amira Top", "Omar Steady", "Lina Slow", "Sam Stalled"]);
    });

    it("gives each target its completion status, growth, target bar and period bars", async () => {
      renderPage();
      const section = await list();
      const [, , lina, sam] = within(section).getAllByRole("article");

      expect(within(lina).getByText("Behind")).toBeInTheDocument();
      expect(within(lina).getByText("−17% vs 2025")).toBeInTheDocument();
      expect(within(sam).getByText("First profit, none in 2025")).toBeInTheDocument();
      expect(within(lina).getByText("Quarterly · 4")).toBeInTheDocument();
      expect(within(lina).getByRole("progressbar", { name: "Profit achieved against the target" })).toHaveAttribute("aria-valuenow", "50");
      expect(within(lina).getByText("Expected by now: 75%")).toBeInTheDocument();
      expect(within(lina).getByRole("img", { name: "Progress of each period against its own target" })).toBeInTheDocument();
      expect(within(lina).getByTitle("Q2 · 40%")).toBeInTheDocument();
      expect(within(within(section).getAllByRole("article")[0]).getByText("Platinum")).toBeInTheDocument();
    });

    it("narrows by search and by status, counting each status", async () => {
      renderPage();
      const section = await list();

      expect(within(section).getAllByRole("article")).toHaveLength(4);
      expect(within(section).getByRole("button", { name: /^All/ })).toHaveTextContent("4");
      expect(within(section).getByRole("button", { name: /^Behind/ })).toHaveTextContent("2");
      expect(within(section).getByRole("button", { name: /^Not started/ })).toBeDisabled();

      fireEvent.click(within(section).getByRole("button", { name: /^Behind/ }));
      await waitFor(() => expect(within(section).getAllByRole("article")).toHaveLength(2));

      fireEvent.change(within(section).getByRole("textbox", { name: "Search by name or email" }), { target: { value: "sam@" } });
      await waitFor(() => expect(within(section).getAllByRole("article")).toHaveLength(1));
      expect(within(section).getByText("Sam Stalled").closest("a")?.getAttribute("href")).toBe("/en/admin/target-management/p-low");
    });

    it("opens a target into its full report only when asked", async () => {
      renderPage();
      const section = await list();
      const sam = within(section).getAllByRole("article")[3];

      expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual(["/api/admin/target-report"]);
      fireEvent.click(within(sam).getByRole("button", { name: "Show full report" }));

      expect(await within(sam).findByText("To go")).toBeInTheDocument();
      expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url)).toContain("/api/admin/target-report?profileId=p-low");
      expect(within(sam).getByRole("button", { name: "Hide report" })).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(within(sam).getByRole("button", { name: "Hide report" }));
      await waitFor(() => expect(within(sam).queryByText("To go")).toBeNull());
    });

    it("opens the reports of a short list straight away", async () => {
      mockApi({ ...report, people: report.people.slice(0, 2), totals: { ...report.totals, people: { total: 2, achieved: 1, onPace: 1, behind: 0, notStarted: 0 } } });
      renderPage();
      const section = await list();

      await waitFor(() => expect(within(section).getAllByText("To go")).toHaveLength(2));
      expect(within(section).getAllByRole("button", { name: "Hide report" })).toHaveLength(2);
    });

    it("says when nothing has started yet instead of counting everyone on pace", async () => {
      const notStarted = report.people.map((row) => ({ ...row, pace: "onPace", expectedProgress: 0, insights: insights("notStarted", { forecast: null }) }));
      mockApi({
        ...report,
        expectedProgress: 0,
        people: notStarted,
        totals: { ...report.totals, people: { total: 4, achieved: 0, onPace: 0, behind: 0, notStarted: 4 } },
      });
      renderPage();
      const totals = await screen.findByRole("region", { name: "Target totals" });

      expect(within(totals).getByText("The 2026 targets have not started yet")).toBeInTheDocument();
      const section = await list();
      expect(within(section).getAllByText("Not started").length).toBeGreaterThan(0);
    });
  });

  it("keeps the tab strip and offers a retry when the report fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    renderPage();

    await screen.findByRole("alert");
    expect(screen.getByRole("navigation", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
