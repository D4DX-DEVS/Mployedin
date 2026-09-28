/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";

import AdminReportsPage from "@/app/[locale]/(dashboard)/admin/reports/page";

let searchParams = new URLSearchParams();
const replace = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/admin/reports",
  useRouter: () => ({ replace, push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => searchParams,
}));

const originalFetch = global.fetch;

const report = {
  period: { key: "30d", days: 30 },
  totalJobs: 11,
  totalApplications: 18,
  totalPlacements: 2,
  revenue: { currency: "AED", total: 6000, others: [{ currency: "INR", total: 50000 }] },
  trends: {
    jobs: { current: 4, previous: 20 },
    // A small baseline reads as a count, not "+800%".
    applications: { current: 9, previous: 1 },
    // Nothing in the previous period: "New", never a made-up +100%.
    placements: { current: 1, previous: 0 },
    revenue: { current: 3000, previous: 0 },
  },
  activitySeries: [
    { month: "2026-01", jobs: 3, applications: 8 },
    { month: "2026-02", jobs: 5, applications: 10 },
  ],
  applicationsByStatus: [
    { key: "applied", count: 6, percent: 33.3 },
    { key: "shortlisted", count: 4, percent: 22.2 },
    { key: "interview_scheduled", count: 3, percent: 16.7 },
    { key: "hired", count: 3, percent: 16.7 },
    { key: "rejected", count: 2, percent: 11.1 },
  ],
  conversion: { applications: 18, reachedInterview: 9, reachedOffer: 4, hired: 3 },
  jobHealth: { active: 8, withoutApplications: 5 },
  alerts: [
    // The API sends an id plus the numbers behind it; the page owns the copy.
    { id: "jobs-without-applications", level: "critical", values: { count: 5 } },
    { id: "demand-softening", level: "warning", values: { delta: -90.5 } },
  ],
};

beforeEach(() => {
  searchParams = new URLSearchParams();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => report } as Response);
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("AdminReportsPage", () => {
  it("is four totals and four cards — the per-row lists are gone", async () => {
    render(<AdminReportsPage />);

    await screen.findByRole("heading", { name: "Hiring Activity" });
    for (const name of ["Attention Needed", "Hiring Conversion", "Application Status"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    for (const gone of [/top agents/i, /recent jobs/i, /recent applications/i, /key findings/i, /hiring funnel/i, /hiring demand/i]) {
      expect(screen.queryByRole("heading", { name: gone })).toBeNull();
    }
  });

  it("reads the period from the URL and asks the API for it", async () => {
    searchParams = new URLSearchParams("period=90d");
    render(<AdminReportsPage />);

    await screen.findByRole("heading", { name: "Hiring Activity" });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/admin/analytics?period=90d");
  });

  it("states what each change badge compares, and never inflates a small baseline", async () => {
    const view = render(<AdminReportsPage />);
    await screen.findByRole("heading", { name: "Hiring Activity" });

    const jobsCard = view.container.querySelector('a[href="/en/admin/jobs"]') as HTMLElement;
    expect(within(jobsCard).getByText("4 posted in the last 30 days")).toBeInTheDocument();
    expect(within(jobsCard).getByText("−80%")).toBeInTheDocument();
    expect(within(jobsCard).getByText("vs previous 30 days")).toBeInTheDocument();

    const applicationsCard = view.container.querySelector('a[href="/en/admin/applications"]') as HTMLElement;
    expect(within(applicationsCard).getByText("+8")).toBeInTheDocument();

    // Placement records, so the card opens the placements list.
    const placementsCard = view.container.querySelector('a[href="/en/admin/placements"]') as HTMLElement;
    expect(within(placementsCard).getByText("New")).toBeInTheDocument();
    expect(view.container.querySelector('a[href*="status=placed"]')).toBeNull();
  });

  it("shows revenue as invoice money in its own currency, naming the others", async () => {
    const view = render(<AdminReportsPage />);
    await screen.findByRole("heading", { name: "Hiring Activity" });

    const revenueCard = view.container.querySelector('a[href="/en/admin/invoices"]') as HTMLElement;
    expect(within(revenueCard).getByText("AED 6,000")).toBeInTheDocument();
    expect(within(revenueCard).getByText("AED 3,000 collected in the last 30 days")).toBeInTheDocument();
    expect(within(revenueCard).getByText("+ 1 other currency, not added in")).toBeInTheDocument();
    expect(revenueCard.textContent).not.toContain("$");
  });

  it("converts applications only, stage by stage, with job health apart", async () => {
    render(<AdminReportsPage />);
    const section = (await screen.findByRole("heading", { name: "Hiring Conversion" })).closest("section") as HTMLElement;

    expect(within(section).getByText("Reached interview")).toBeInTheDocument();
    expect(within(section).getByText("50% of applications")).toBeInTheDocument();
    expect(within(section).getByText("44% of those interviewed")).toBeInTheDocument();
    expect(within(section).getByText("75% of those offered")).toBeInTheDocument();
    // Jobs are not a funnel stage any more.
    expect(section.querySelector('[data-stage="jobs"]')).toBeNull();
    expect(within(section).getByText("Receiving applications").closest("div")?.textContent).toContain("3");
  });

  it("lists statuses with the dashboard's names, each linking to its applications", async () => {
    render(<AdminReportsPage />);
    const section = (await screen.findByRole("heading", { name: "Application Status" })).closest("section") as HTMLElement;

    expect(within(section).getByText("Applied")).toBeInTheDocument();
    expect(within(section).getByText("Interview Scheduled").closest("a")?.getAttribute("href")).toBe("/en/admin/applications?status=interview_scheduled");
    expect(within(section).getByText("33.3%")).toBeInTheDocument();
  });

  it("keeps the findings as rows that link to where the admin acts", async () => {
    render(<AdminReportsPage />);
    const section = (await screen.findByRole("heading", { name: "Attention Needed" })).closest("section") as HTMLElement;

    const finding = within(section).getByText("5 jobs have no applications").closest("a");
    expect(finding?.getAttribute("href")).toContain("/admin/jobs");
    expect(finding?.getAttribute("data-alert-level")).toBe("critical");
    // The softening delta renders unsigned — the copy already says "down".
    expect(within(section).getByText("Applications down 90.5%")).toBeInTheDocument();
    expect(within(section).getByText("Open the attention queue").closest("a")?.getAttribute("href")).toBe("/en/admin?tab=attention");
  });

  it("shows an error with a retry when the report fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<AdminReportsPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Reports" })).toBeInTheDocument();
  });
});
