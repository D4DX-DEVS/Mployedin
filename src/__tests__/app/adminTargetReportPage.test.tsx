/**
 * @jest-environment jsdom
 */
/**
 * The Targets report tab: four totals, monthly progress beside who is behind
 * pace, then everyone's progress in one table. It used to stack a six-line
 * chart, a commission "business volume" chart, a year-over-year grid, a
 * quarterly chart mixing counts with money, and two capped tables.
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

const person = (overrides: Record<string, unknown>) => ({
  email: "",
  role: "agent",
  region: null,
  employers: { target: 10, achieved: 5 },
  employees: { target: 10, achieved: 5 },
  finance: { currency: "INR", target: 1000, achieved: 500 },
  ...overrides,
});

const report = {
  year: 2026,
  years: [2027, 2026],
  expectedProgress: 75,
  totals: {
    employers: { target: 40, achieved: 10 },
    employees: { target: 100, achieved: 30 },
    finance: { currency: "INR", target: 100000, achieved: 25000, others: [{ currency: "AED", target: 5000, achieved: 0 }] },
    people: { total: 4, achieved: 1, onPace: 1, behind: 2 },
  },
  monthly: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    employers: { target: 3, achieved: index < 3 ? 2 : 0 },
    employees: { target: 8, achieved: 1 },
    finance: { target: 8000, achieved: 2000 },
  })),
  people: [
    person({ id: "p-top", name: "Amira Top", role: "super_agent", region: "Dubai", progress: 110, pace: "achieved" }),
    person({ id: "p-ok", name: "Omar Steady", progress: 80, pace: "onPace" }),
    person({ id: "p-mid", name: "Lina Slow", progress: 50, pace: "behind" }),
    person({ id: "p-low", name: "Sam Stalled", email: "sam@example.com", progress: 10, pace: "behind" }),
  ],
};

const originalFetch = global.fetch;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminTargetReportPage /></QueryClientProvider>);
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => report } as Response);
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("AdminTargetReportPage", () => {
  it("is four totals, two cards and one table; the old sections are gone", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "Monthly progress" });
    expect(screen.getByRole("heading", { name: "Behind pace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Progress by person" })).toBeInTheDocument();
    for (const gone of [/business volume/i, /year-over-year/i, /quarterly/i, /supervisor performance/i, /agent performance/i]) {
      expect(screen.queryByRole("heading", { name: gone })).toBeNull();
    }
  });

  it("asks the API for the year in the URL", async () => {
    searchParams = new URLSearchParams("year=2027");
    renderPage();

    await screen.findByRole("heading", { name: "Monthly progress" });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/admin/target-report?year=2027");
  });

  it("shows finance in its own currency and names the currencies it left out", async () => {
    renderPage();
    const totals = await screen.findByRole("region", { name: "Target totals" });

    expect(within(totals).getByText("₹25,000")).toBeInTheDocument();
    expect(within(totals).getByText("Approved commission, of a ₹100,000 target")).toBeInTheDocument();
    expect(within(totals).getByText("+ 1 other currency, not added in")).toBeInTheDocument();
    expect(within(totals).getByText("10 / 40")).toBeInTheDocument();
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

  it("charts one metric at a time", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Monthly progress" });

    expect(screen.getByRole("img", { name: "Employers: target and achieved per month in 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Finance: target and achieved per month in 2026" })).toBeInTheDocument();
    expect(screen.getByText("Amounts in INR")).toBeInTheDocument();
  });

  it("puts everyone in one table that search narrows", async () => {
    renderPage();
    const table = await screen.findByRole("region", { name: "Progress by person" });

    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("Achieved")).toBeInTheDocument();
    fireEvent.change(within(table).getByRole("textbox", { name: "Search by name or email" }), { target: { value: "sam@" } });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2));
    expect(within(table).getByText("Sam Stalled").closest("a")?.getAttribute("href")).toBe("/en/admin/target-management/p-low");
  });

  it("keeps the tab strip and offers a retry when the report fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    renderPage();

    await screen.findByRole("alert");
    expect(screen.getByRole("navigation", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
