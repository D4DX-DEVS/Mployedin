/**
 * @jest-environment jsdom
 */
/**
 * The one profit report every role reads: an agent their own, a super agent
 * their own with the team underneath, admin either.
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ProfitReportView } from "@/components/features/targets/ProfitReportView";
import type { TargetReport } from "@/lib/targets/profitReport";

function report(overrides: Partial<TargetReport> = {}): TargetReport {
  return {
    year: 2027,
    currency: "AED",
    person: { profileId: "p1", userId: "u1", name: "Sara Lead", email: "sara@example.com", role: "super_agent", region: null },
    summary: {
      profitTarget: 120000, profitAchieved: 30000, profitPending: 90000, profitProgress: 25,
      expectedProgress: 50, riskScore: "high", incentiveTier: "none", pace: "behind",
      insights: {
        status: "behind",
        remaining: 90000,
        timeline: { startDate: "2027-01-01", endDate: "2027-12-31", daysTotal: 365, daysElapsed: 183, daysLeft: 182, daysToStart: 0 },
        forecast: { profit: 60000, progress: 50 },
        yearOverYear: { previous: 20000, pct: 50, trend: "up" },
        momentum: { previous: 10000, latest: 20000, pct: 100, trend: "up" },
      },
    },
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, profitTarget: 10000, profitAchieved: i < 3 ? 10000 : 0,
      revenue: i < 3 ? 14000 : 0, commissionCost: i < 3 ? 4000 : 0, invoicesPaid: i < 3 ? 2 : 0, placements: 1, newEmployers: 0,
    })),
    drivers: { profit: 30000, revenue: 42000, commissionCost: 12000, invoicesPaid: 6, placements: 12, newEmployers: 3 },
    byCategory: [
      { category: "recruitment", profit: 24000, share: 80 },
      { category: "subscription", profit: 6000, share: 20 },
      { category: "some_future_category", profit: 0, share: 0 },
    ],
    previousYear: { year: 2026, profit: 20000, growthPct: 50 },
    schedule: { periodType: "monthly", periods: [] },
    ...overrides,
  };
}

const team = {
  rows: [
    { profileId: "a1", userId: "ua1", name: "Amy Agent", email: "amy@example.com", region: "Dubai", profitTarget: 60000, profitAchieved: 24000, profitProgress: 40, riskScore: "medium" as const, incentiveTier: "bronze" as const, pace: "behind" as const, shareOfTeam: 80 },
  ],
  otherProfit: 6000,
  allocatedTarget: 60000,
};

describe("ProfitReportView", () => {
  it("leads with the profit, what it came from, and how it is going", () => {
    render(<ProfitReportView report={report()} />);

    expect(screen.getAllByText("AED 30,000").length).toBeGreaterThan(0);
    expect(screen.getByText("of a AED 120,000 target")).toBeInTheDocument();
    expect(screen.getByText("AED 42,000")).toBeInTheDocument(); // revenue
    expect(screen.getByText("AED 12,000")).toBeInTheDocument(); // commission cost
    expect(screen.getByText("29% of revenue goes to commissions")).toBeInTheDocument();
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Behind").length).toBeGreaterThan(0);
  });

  describe("target status", () => {
    const status = () => screen.getByRole("region", { name: "Target status" });

    it("opens with the completion status, growth against last year and the target bar", () => {
      render(<ProfitReportView report={report()} />);

      expect(within(status()).getByText("Behind")).toBeInTheDocument();
      expect(within(status()).getByText("+50% vs 2026")).toBeInTheDocument();
      expect(within(status()).getByText("Monthly")).toBeInTheDocument();
      const bar = within(status()).getByRole("progressbar", { name: "Profit achieved against the target" });
      expect(bar).toHaveAttribute("aria-valuenow", "25");
      expect(within(status()).getAllByText("Expected by now: 50%").length).toBeGreaterThan(0);
    });

    it("says what is left, where it is heading, how long there is and how the latest period went", () => {
      render(<ProfitReportView report={report()} />);

      expect(within(status()).getByText("AED 90,000")).toBeInTheDocument();
      expect(within(status()).getByText("to reach the AED 120,000 target")).toBeInTheDocument();
      expect(within(status()).getByText("AED 60,000")).toBeInTheDocument();
      expect(within(status()).getByText("50% of the target at this pace")).toBeInTheDocument();
      expect(within(status()).getByText("182 days left")).toBeInTheDocument();
      expect(within(status()).getByText("+100%")).toBeInTheDocument();
    });

    it("has a bar for each period of a schedule that is not monthly", () => {
      const quarters = [
        { startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 60000, profitAchieved: 60000, profitProgress: 100, status: "past" as const },
        { startDate: "2027-04-01", endDate: "2027-06-30", profitTarget: 60000, profitAchieved: 0, profitProgress: 0, status: "current" as const },
      ];
      render(<ProfitReportView report={report({ schedule: { periodType: "quarterly", periods: quarters } })} />);

      expect(within(status()).getByText("2 quarterly periods")).toBeInTheDocument();
      expect(within(status()).getByRole("img", { name: "Progress of each period against its own target" })).toBeInTheDocument();
      expect(within(status()).getByTitle("Q1 · 100%")).toBeInTheDocument();
    });

    it("says so when the schedule has not started, and when it is too early to forecast", () => {
      const insights = {
        ...report().summary.insights,
        status: "notStarted" as const,
        forecast: null,
        timeline: { startDate: "2027-01-01", endDate: "2027-12-31", daysTotal: 365, daysElapsed: 0, daysLeft: 365, daysToStart: 78 },
        momentum: null,
      };
      render(<ProfitReportView report={report({ summary: { ...report().summary, insights } })} />);

      expect(within(status()).getByText("Not started")).toBeInTheDocument();
      expect(within(status()).getByText("Starts in 78 days")).toBeInTheDocument();
      expect(within(status()).getByText("Not started yet")).toBeInTheDocument();
      expect(within(status()).getByText("Needs two finished periods")).toBeInTheDocument();
    });

    it("shows only the insight tiles when the page around it already carries the status", () => {
      render(<ProfitReportView report={report()} headline="tiles" />);

      expect(screen.queryByRole("region", { name: "Target status" })).toBeNull();
      expect(screen.getByText("To go")).toBeInTheDocument();
      expect(screen.getByText("182 days left")).toBeInTheDocument();
    });
  });

  it("names the income streams, with a generic label for one it does not know", () => {
    render(<ProfitReportView report={report()} />);
    const card = screen.getByRole("region", { name: "Where the profit comes from" });

    expect(within(card).getByText("Recruitment")).toBeInTheDocument();
    expect(within(card).getByText("Subscriptions")).toBeInTheDocument();
    expect(within(card).getByText("Other")).toBeInTheDocument();
  });

  it("compares with last year, or says there is nothing to compare with", () => {
    const { rerender } = render(<ProfitReportView report={report()} />);
    expect(screen.getByText("+50% vs last year")).toBeInTheDocument();

    rerender(<ProfitReportView report={report({ previousYear: { year: 2026, profit: 0, growthPct: null } })} />);
    expect(screen.getByText("No profit last year to compare with")).toBeInTheDocument();
  });

  it("shows no team section for an agent's own report", () => {
    render(<ProfitReportView report={report()} />);

    expect(screen.queryByRole("region", { name: "Team" })).toBeNull();
  });

  it("lists the team for a super agent and opens an agent from it", () => {
    const onSelectAgent = jest.fn();
    render(<ProfitReportView report={report({ team })} onSelectAgent={onSelectAgent} />);
    const section = screen.getByRole("region", { name: "Team" });

    expect(within(section).getByText("80%")).toBeInTheDocument();
    expect(within(section).getByText(/AED 6,000 of the profit came from invoices that are not one of these agents' own/)).toBeInTheDocument();
    fireEvent.click(within(section).getByRole("button", { name: "Amy Agent" }));
    expect(onSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ userId: "ua1", profileId: "a1" }));
  });

  it("shows team names as plain text when the viewer cannot open them", () => {
    render(<ProfitReportView report={report({ team })} />);

    expect(screen.queryByRole("button", { name: "Amy Agent" })).toBeNull();
    expect(screen.getByText("Amy Agent")).toBeInTheDocument();
  });
});

describe("schedule section", () => {
  const quarters = [
    { startDate: "2027-01-01", endDate: "2027-03-31", profitTarget: 30000, profitAchieved: 30000, profitProgress: 100, status: "past" as const },
    { startDate: "2027-04-01", endDate: "2027-06-30", profitTarget: 30000, profitAchieved: 6000, profitProgress: 20, status: "current" as const },
    { startDate: "2027-07-01", endDate: "2027-09-30", profitTarget: 30000, profitAchieved: 0, profitProgress: 0, status: "upcoming" as const },
    { startDate: "2027-10-01", endDate: "2027-12-31", profitTarget: 30000, profitAchieved: 0, profitProgress: 0, status: "upcoming" as const },
  ];

  it("lists each period of a quarterly target with its dates, progress and status", () => {
    render(<ProfitReportView report={report({ schedule: { periodType: "quarterly", periods: quarters } })} />);
    const section = screen.getByRole("region", { name: "Targets by period" });

    expect(within(section).getByText("Q1")).toBeInTheDocument();
    expect(within(section).getByText("Q4")).toBeInTheDocument();
    expect(within(section).getByText("Jan 1 – Mar 31")).toBeInTheDocument();
    expect(within(section).getByText("Past")).toBeInTheDocument();
    expect(within(section).getByText("Current")).toBeInTheDocument();
    expect(within(section).getAllByText("Upcoming")).toHaveLength(2);
    expect(within(section).getByText("20%")).toBeInTheDocument();
  });

  it("names a custom period by its label, or by its position when it has none", () => {
    const custom = [
      { label: "Spring push", startDate: "2027-03-01", endDate: "2027-04-30", profitTarget: 60000, profitAchieved: 0, profitProgress: 0, status: "upcoming" as const },
      { startDate: "2027-09-01", endDate: "2027-09-30", profitTarget: 60000, profitAchieved: 0, profitProgress: 0, status: "upcoming" as const },
    ];
    render(<ProfitReportView report={report({ schedule: { periodType: "custom", periods: custom } })} />);
    const section = screen.getByRole("region", { name: "Targets by period" });

    expect(within(section).getByText("Spring push")).toBeInTheDocument();
    expect(within(section).getByText("Period 2")).toBeInTheDocument();
  });

  it("has no period table for a monthly target: the month grid already is one", () => {
    render(<ProfitReportView report={report()} />);

    expect(screen.queryByRole("region", { name: "Targets by period" })).toBeNull();
  });
});
