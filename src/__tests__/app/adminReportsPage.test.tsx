/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";

import AdminReportsPage from "@/app/[locale]/(dashboard)/admin/reports/page";

const originalFetch = global.fetch;

describe("AdminReportsPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalJobs: 11,
        totalApplications: 18,
        totalPlacements: 2,
        totalRevenue: 6000,
        trends: {
          jobs: { current: 4, previous: 2, delta: 100, direction: "up" },
          applications: { current: 9, previous: 6, delta: 50, direction: "up" },
          placements: { current: 1, previous: 0, delta: 100, direction: "up" },
          revenue: { current: 3000, previous: 0, delta: 100, direction: "up" },
        },
        activitySeries: [
          { label: "Jan 26", jobs: 3, applications: 8 },
          { label: "Feb 26", jobs: 5, applications: 10 },
        ],
        applicationsByStatus: [
          { key: "pending", label: "Pending", count: 6, percent: 33.3, toneKey: "sky" },
          { key: "shortlisted", label: "Shortlisted", count: 4, percent: 22.2, toneKey: "violet" },
          { key: "interviewed", label: "Interviewed", count: 3, percent: 16.7, toneKey: "amber" },
          { key: "rejected", label: "Rejected", count: 2, percent: 11.1, toneKey: "rose" },
        ],
        funnel: [
          { key: "jobs", label: "Jobs", count: 11 },
          { key: "applications", label: "Applications", count: 18 },
          { key: "interviews", label: "Interviews", count: 5 },
          { key: "placements", label: "Placements", count: 2 },
        ],
        alerts: [
          {
            // The API sends an id plus the numbers behind it; the page owns the
            // copy so an Arabic admin doesn't get an English sentence.
            id: "jobs-without-applications",
            level: "critical",
            values: { count: 4 },
          },
        ],
        recentJobs: [
          {
            id: "job-1",
            title: "Operations Manager",
            status: "Active",
            createdAt: "2026-04-14T00:00:00.000Z",
            employerName: "Northstar Foods",
            applicationCount: 4,
          },
        ],
        recentApplications: [
          {
            id: "app-1",
            status: "Shortlisted",
            appliedAt: "2026-04-15T00:00:00.000Z",
            jobTitle: "Operations Manager",
            employerName: "Northstar Foods",
          },
        ],
        topAgents: [
          {
            id: "agent-1",
            name: "Sarah Ahmed",
            jobs: 3,
            applications: 8,
            placements: 2,
            revenue: 3000,
          },
        ],
        summary: {
          jobsWithoutApplications: 4,
          staleOpenApplications: 2,
          applicationRate: 1.64,
          placementRate: 0.11,
        },
      }),
    } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders reports as an insight-driven admin dashboard instead of a flat scorecard", async () => {
    const view = render(<AdminReportsPage />);

    await screen.findByRole("heading", { name: /platform alerts/i });

    const heroSection = screen.getByRole("heading", { name: /reports & analytics/i }).closest("section");
    const alertsSection = screen.getByRole("heading", { name: /platform alerts/i }).closest("section");
    const trendSection = screen.getByRole("heading", { name: /jobs vs applications/i }).closest("section");
    const funnelSection = screen.getByRole("heading", { name: /conversion funnel/i }).closest("section");

    expect(heroSection).toBeInTheDocument();
    expect(alertsSection).toBeInTheDocument();
    expect(trendSection).toBeInTheDocument();
    expect(funnelSection).toBeInTheDocument();
    const criticalAlertCard = alertsSection?.querySelector('[data-alert-level="critical"]');

    expect(criticalAlertCard).not.toBeNull();
    // Theme-aware surface tokens, not the light-only `bg-white` literal this
    // assertion used to pin — the card has to stay readable in dark mode. The
    // severity now reads from the border accent rather than the background.
    expect(criticalAlertCard?.className).toContain("bg-card");
    expect(criticalAlertCard?.className).toContain("border-status-rejected/25");
    expect(criticalAlertCard?.className).toContain("border-l-status-rejected");
    const criticalAlertTitle = within(criticalAlertCard as HTMLElement).getByText("Jobs without demand");
    const criticalAlertDescription = within(criticalAlertCard as HTMLElement).getByText(/need stronger sourcing or distribution/i);
    const criticalAlertMetric = within(criticalAlertCard as HTMLElement).getByText("4 roles");

    expect(criticalAlertTitle.className).toContain("text-foreground");
    expect(criticalAlertDescription.className).toContain("text-muted-foreground");
    expect(criticalAlertMetric.className).toContain("bg-status-rejected");
    expect(screen.getAllByText("11").some((element) => element.className.includes("text-foreground"))).toBe(true);
    expect(screen.getAllByText("18").some((element) => element.className.includes("text-foreground"))).toBe(true);
    expect(screen.getAllByText("Jobs without demand").length).toBeGreaterThan(0);
    expect(screen.getByText("Recent Jobs")).toBeInTheDocument();
    expect(screen.getByText("Recent Applications")).toBeInTheDocument();
    expect(screen.getByText("Top Agents")).toBeInTheDocument();
    expect(screen.getByText("Sarah Ahmed")).toBeInTheDocument();
    expect(screen.getAllByText("Operations Manager").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(trendSection?.querySelector(".bg-blue-500")).not.toBeNull();
    expect(trendSection?.querySelector(".bg-violet-500")).not.toBeNull();

    expect(view.container.innerHTML).not.toContain("card-base");
    expect(view.container.innerHTML).not.toContain("bg-card rounded-xl shadow-sm border p-5");
  });
});