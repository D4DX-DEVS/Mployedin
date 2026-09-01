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
          {
            id: "demand-softening",
            level: "warning",
            values: { delta: -90.5 },
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
          {
            id: "job-2",
            title: "Sous Chef",
            status: "Draft",
            createdAt: "2026-04-13T00:00:00.000Z",
            employerName: "Northstar Foods",
            applicationCount: 0,
          },
          {
            id: "job-3",
            title: "Line Cook",
            status: "Active",
            createdAt: "2026-04-12T00:00:00.000Z",
            employerName: "Northstar Foods",
            applicationCount: 1,
          },
          {
            id: "job-4",
            title: "Dishwasher",
            status: "Active",
            createdAt: "2026-04-11T00:00:00.000Z",
            employerName: "Northstar Foods",
            applicationCount: 0,
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

  it("renders the compact analytical report instead of the old alert wall", async () => {
    const view = render(<AdminReportsPage />);

    await screen.findByRole("heading", { name: /key findings/i });

    // Section skeleton: findings, demand trend, status, funnel, agents, recents.
    expect(screen.getByRole("heading", { name: /hiring demand/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /application status/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /hiring funnel/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /top agents/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recent jobs/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recent applications/i })).toBeInTheDocument();

    // The merged sections are gone.
    expect(screen.queryByText(/platform alerts/i)).toBeNull();
    expect(screen.queryByText(/operational highlights/i)).toBeNull();
    expect(screen.queryByText(/jobs vs applications/i)).toBeNull();
    expect(screen.queryByText(/conversion funnel/i)).toBeNull();

    // Findings are compact, numbered rows that link to where the admin acts.
    // The jest next-intl mock does plain placeholder substitution, not ICU
    // plurals, so match the phrase rather than the fully formatted sentence.
    const criticalFinding = screen.getByText(/jobs have no applications/).closest("a");
    expect(criticalFinding).not.toBeNull();
    expect(criticalFinding?.getAttribute("href")).toContain("/admin/jobs");
    expect(criticalFinding?.getAttribute("data-alert-level")).toBe("critical");

    // The softening delta renders unsigned — the copy already says "down".
    expect(screen.getByText("Applications down 90.5%")).toBeInTheDocument();

    // Demand trend is one shared-baseline SVG chart, not per-month cards.
    const demandSection = screen.getByRole("heading", { name: /hiring demand/i }).closest("section");
    expect(demandSection?.querySelector("svg")).not.toBeNull();

    // Status breakdown is a compact row list with counts and percentages.
    const statusSection = screen.getByRole("heading", { name: /application status/i }).closest("section");
    expect(within(statusSection as HTMLElement).getByText("Pending")).toBeInTheDocument();
    expect(within(statusSection as HTMLElement).getByText("33.3%")).toBeInTheDocument();
    expect(statusSection?.querySelector(".bg-blue-500")).not.toBeNull();

    // Recent jobs cap at three rows plus a view-all link.
    const jobsSection = screen.getByRole("heading", { name: /recent jobs/i }).closest("section");
    expect(within(jobsSection as HTMLElement).getByText("Line Cook")).toBeInTheDocument();
    expect(within(jobsSection as HTMLElement).queryByText("Dishwasher")).toBeNull();
    expect(within(jobsSection as HTMLElement).getByText(/view all jobs/i).closest("a")?.getAttribute("href")).toContain("/admin/jobs");

    // Agents collapse into ranked one-line rows.
    const agentsSection = screen.getByRole("heading", { name: /top agents/i }).closest("section");
    expect(within(agentsSection as HTMLElement).getByText("Sarah Ahmed")).toBeInTheDocument();
    expect(within(agentsSection as HTMLElement).getByText("3 jobs · 8 applications · 2 placements")).toBeInTheDocument();

    expect(screen.getAllByText("11").some((element) => element.className.includes("text-foreground"))).toBe(true);
    expect(screen.getAllByText("18").some((element) => element.className.includes("text-foreground"))).toBe(true);

    expect(view.container.innerHTML).not.toContain("card-base");
    expect(view.container.innerHTML).not.toContain("bg-card rounded-xl shadow-sm border p-5");
  });
});
