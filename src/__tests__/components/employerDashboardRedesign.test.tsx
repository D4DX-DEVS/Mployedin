/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { AttentionPanel, buildAttentionItems } from "@/components/features/employer/dashboard/AttentionPanel";
import { EmployerKpiStrip, windowDelta } from "@/components/features/employer/dashboard/EmployerKpiStrip";
import { JobsHealthPanel } from "@/components/features/employer/dashboard/JobsHealthPanel";
import { AIRecommendedCandidatesCard } from "@/components/features/employer/dashboard/AIRecommendedCandidatesCard";
import { DraftsCard } from "@/components/features/employer/dashboard/DraftsCard";
import type { EmployerDashboardStats } from "@/lib/dashboard/employerStats";

const translations: Record<string, string> = {
  "employerDashboard.overview.kpi.activeJobs": "Active jobs",
  "employerDashboard.overview.kpi.newApplications": "New applications ({days}d)",
  "employerDashboard.overview.kpi.highMatches": "High AI matches",
  "employerDashboard.overview.kpi.upcomingInterviews": "Upcoming interviews",
  "employerDashboard.overview.kpi.offersPending": "Offers pending",
  "employerDashboard.overview.kpi.companyViews": "Company views ({days}d)",
  "employerDashboard.overview.kpi.hires": "Hires ({days}d)",
  "employerDashboard.overview.kpi.postedInWindow": "{count} posted in {days} days",
  "employerDashboard.overview.kpi.awaitingReview": "{count} awaiting review",
  "employerDashboard.overview.kpi.highMatchesInWindow": "{count} new in {days} days",
  "employerDashboard.overview.kpi.interviewsToday": "{count} today",
  "employerDashboard.overview.kpi.offersInWindow": "{count} sent in {days} days",
  "employerDashboard.overview.kpi.viewsHint": "Job seekers who opened your profile",
  "employerDashboard.overview.kpi.hiresTotal": "{count} hires overall",
  "employerDashboard.overview.kpi.changeNone": "No change",
  "employerDashboard.overview.kpi.changeNew": "New in the last {days} days",
  "employerDashboard.overview.kpi.changePercent": "{direction} {value}% vs previous {days} days",
  "employerDashboard.overview.attention.title": "Needs your attention",
  "employerDashboard.overview.attention.itemsNeedAction": "{count} items",
  "employerDashboard.overview.attention.allClear": "All clear",
  "employerDashboard.overview.attention.allClearDetail": "Nothing is waiting on you.",
  "employerDashboard.overview.attention.levels.critical": "Critical",
  "employerDashboard.overview.attention.levels.warning": "Warning",
  "employerDashboard.overview.attention.levels.upcoming": "Upcoming",
  "employerDashboard.overview.attention.items.unreviewed48h": "{count} applications unreviewed for 48h+",
  "employerDashboard.overview.attention.items.unreviewed48hDetail": "Oldest first",
  "employerDashboard.overview.attention.items.newApplications": "{count} new applications",
  "employerDashboard.overview.attention.items.newApplicationsDetail": "Waiting for a first look",
  "employerDashboard.overview.attention.items.interviewsToday": "{count} interviews today",
  "employerDashboard.overview.attention.items.interviewsTodayDetail": "Today's schedule",
  "employerDashboard.overview.attention.items.draftJobs": "{count} draft jobs",
  "employerDashboard.overview.attention.items.draftJobsDetail": "Finish and publish",
  "employerDashboard.overview.attention.items.setupIncomplete": "{count} setup steps left",
  "employerDashboard.overview.attention.items.setupIncompleteDetail": "Complete your workspace",
  "employerDashboard.overview.jobsHealth.title": "Jobs health",
  "employerDashboard.overview.jobsHealth.subtitle": "{count} active",
  "employerDashboard.overview.jobsHealth.viewJobs": "View jobs",
  "employerDashboard.overview.jobsHealth.active": "Active",
  "employerDashboard.overview.jobsHealth.paused": "Paused",
  "employerDashboard.overview.jobsHealth.drafts": "Drafts",
  "employerDashboard.overview.jobsHealth.expiring7d": "Expiring within 7 days",
  "employerDashboard.overview.jobsHealth.noApplications": "No applications yet",
  "employerDashboard.aiRecommended.heading": "Profile match estimates",
  "employerDashboard.aiRecommended.subheading": "{count} matches across {jobs} jobs.",
  "employerDashboard.aiRecommended.reviewCandidates": "Review candidates",
  "employerDashboard.aiRecommended.band90Plus": "Above 90% match",
  "employerDashboard.aiRecommended.band90PlusDesc": "Review the full application.",
  "employerDashboard.aiRecommended.band80to89": "80–89% match",
  "employerDashboard.aiRecommended.band80to89Desc": "Verify experience.",
  "employerDashboard.aiRecommended.needsReview": "Needs review",
  "employerDashboard.aiRecommended.needsReviewDesc": "Human review required.",
  "employerDashboard.aiRecommended.assistiveNote": "Estimates do not replace human assessment.",
  "employerDashboard.aiRecommended.emptyTitle": "No match estimates yet",
  "employerDashboard.aiRecommended.emptyDescription": "Estimates appear after scoring.",
  "employerDashboard.drafts.title": "Drafts to resume",
  "employerDashboard.drafts.subtitle": "Pick up where you left off.",
  "employerDashboard.drafts.tabsLabel": "Draft type",
  "employerDashboard.drafts.tabJobs": "Jobs",
  "employerDashboard.drafts.tabChats": "AI chats",
  "employerDashboard.drafts.tabExtractions": "Extractions",
  "employerDashboard.drafts.emptyTitle": "No drafts to resume",
  "employerDashboard.drafts.emptyDescription": "Unfinished jobs and AI sessions appear here.",
};

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) =>
    (key: string, values?: Record<string, string | number>) => {
      const template = translations[`${namespace}.${key}`] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{${name}}`, String(value)),
        template,
      );
    },
}));

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm: jest.fn(), ConfirmDialogNode: null }) }));
// recharts needs layout; the KPI sparkline is decorative, so stub the chart.
jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  Area: () => null,
}));

beforeAll(() => {
  // Draft cards fetch on mount; a non-ok response makes them report zero drafts.
  global.fetch = jest.fn(() => Promise.resolve({ ok: false })) as unknown as typeof fetch;
});

const t = (key: string, values?: Record<string, string | number>) =>
  Object.entries(values ?? {}).reduce(
    (result, [name, value]) => result.replace(`{${name}}`, String(value)),
    translations[`employerDashboard.${key}`] ?? key,
  );

const day = (i: number) => `2026-09-${String(i + 1).padStart(2, "0")}`;
const stats: EmployerDashboardStats = {
  companyName: "Acme",
  activeJobCount: 4,
  draftJobCount: 2,
  pausedJobCount: 1,
  totalApplications: 40,
  newApplications: 6,
  inReview: 5,
  scheduledInterviews: 3,
  interviewsToday: 1,
  placements: 2,
  offerCount: 3,
  offersSent: 1,
  avgMatchScore: 70,
  highMatchCount: 7,
  band90PlusCount: 3,
  band80to89Count: 4,
  needsReviewCount: 20,
  lowMatchCount: 5,
  avgTimeToHire: 12,
  lastActivityMinutes: 30,
  windowDays: 30,
  applicationsWindow: { current: 24, previous: 12 },
  highMatchesWindow: { current: 5, previous: 5 },
  jobsPostedWindow: { current: 2, previous: 0 },
  offersWindow: { current: 1, previous: 2 },
  viewsWindow: { current: 0, previous: 0 },
  hiresWindow: { current: 1, previous: 0 },
  daily: Array.from({ length: 30 }, (_, i) => ({ day: day(i), applications: i % 3, highMatches: 0, interviews: 0, jobs: 0, offers: 0, views: 0, hires: 0 })),
  upcomingInterviews: 3,
  unreviewedOver48h: 2,
  offersAwaitingResponse: 1,
  expiringJobs7d: 0,
  jobsWithoutApplications: 1,
  setupStepsRemaining: 2,
  pipelineByStatus: [{ status: "applied", count: 6 }, { status: "hired", count: 2 }],
  topJobs: [{ id: "j1", title: "Engineer", status: "active", applications: 10 }],
};

describe("Employer overview dashboard", () => {
  it("orders attention items most urgent first and links each to its filtered list", () => {
    const items = buildAttentionItems(stats);
    expect(items.map((i) => i.id)).toEqual([
      "unreviewed-48h",
      "interviews-today",
      "offers-awaiting",
      "new-applications",
      "jobs-without-applications",
      "draft-jobs",
      "setup-incomplete",
    ]);
    // Fresh applications exclude the stale ones already counted above.
    expect(items.find((i) => i.id === "new-applications")?.count).toBe(4);
    expect(items[0].path).toBe("/employer/applications?status=applied&sort=oldest");

    render(<AttentionPanel stats={stats} locale="en" />);
    expect(screen.getByRole("heading", { name: "Needs your attention" })).toBeInTheDocument();
    expect(screen.getByText("2 applications unreviewed for 48h+").closest("a")).toHaveAttribute(
      "href",
      "/en/employer/applications?status=applied&sort=oldest",
    );
  });

  it("tells a new employer to post a job and is all clear when nothing waits", () => {
    const fresh = { ...stats, activeJobCount: 0, draftJobCount: 0, newApplications: 0, unreviewedOver48h: 0, interviewsToday: 0, offersAwaitingResponse: 0, jobsWithoutApplications: 0, setupStepsRemaining: 0 };
    expect(buildAttentionItems(fresh).map((i) => i.id)).toEqual(["no-active-jobs"]);

    render(<AttentionPanel stats={{ ...fresh, activeJobCount: 1 }} locale="en" />);
    expect(screen.getByText("Nothing is waiting on you.")).toBeInTheDocument();
  });

  it("computes window deltas against the previous period", () => {
    expect(windowDelta({ current: 24, previous: 12 }, 30, t)).toMatchObject({ text: "+100%", direction: "up" });
    expect(windowDelta({ current: 1, previous: 2 }, 30, t)).toMatchObject({ text: "−50%", direction: "down" });
    const fresh = windowDelta({ current: 2, previous: 0 }, 30, t);
    expect(fresh.direction).toBe("up");
    expect(fresh.text).toBeUndefined();
    const none = windowDelta({ current: 0, previous: 0 }, 30, t);
    expect(none.direction).toBe("flat");
    expect(none.text).toBeUndefined();
  });

  it("renders six linked KPI tiles and falls back to hires when there are no profile views", () => {
    render(<EmployerKpiStrip stats={stats} locale="en" />);
    const tiles = screen.getAllByRole("link");
    expect(tiles).toHaveLength(6);
    expect(screen.getByText("Hires (30d)")).toBeInTheDocument();
    expect(screen.queryByText("Company views (30d)")).not.toBeInTheDocument();
    expect(screen.getByText("New applications (30d)").closest("a")).toHaveAttribute("href", "/en/employer/applications?status=applied");
    expect(screen.getByLabelText("up 100% vs previous 30 days")).toBeInTheDocument();
  });

  it("shows company views when any were recorded", () => {
    render(<EmployerKpiStrip stats={{ ...stats, viewsWindow: { current: 9, previous: 4 } }} locale="en" />);
    expect(screen.getByText("Company views (30d)")).toBeInTheDocument();
    expect(screen.queryByText("Hires (30d)")).not.toBeInTheDocument();
  });

  it("lists job health rows linked to the jobs list by status", () => {
    render(<JobsHealthPanel stats={stats} locale="en" />);
    expect(screen.getByRole("heading", { name: "Jobs health" })).toBeInTheDocument();
    expect(screen.getByText("Drafts").closest("a")).toHaveAttribute("href", "/en/employer/jobs?status=draft");
    expect(screen.getByText("Paused").closest("a")).toHaveAttribute("href", "/en/employer/jobs?status=paused");
  });

  it("keeps match estimates review-only with the assistive note in the panel", () => {
    render(
      <AIRecommendedCandidatesCard
        highMatchCount={3}
        band90PlusCount={2}
        band80to89Count={1}
        needsReviewCount={22}
        activeJobCount={16}
        locale="en"
      />,
    );

    expect(screen.getByRole("heading", { name: "Profile match estimates" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /notify/i })).not.toBeInTheDocument();
    expect(screen.getByText("Estimates do not replace human assessment.")).toBeInTheDocument();
    expect(screen.getByText("Above 90% match").closest("a")).toHaveAttribute("href", "/en/employer/applications?scoreMin=90&scoreMax=101");
  });

  it("shows an empty state in the drafts panel once every source reports nothing", async () => {
    render(<DraftsCard locale="en" />);
    expect(screen.getByRole("heading", { name: "Drafts to resume" })).toBeInTheDocument();
    expect(await screen.findByText("No drafts to resume")).toBeInTheDocument();
  });
});
