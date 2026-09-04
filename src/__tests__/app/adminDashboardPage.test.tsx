/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import AdminDashboardPage from "@/app/[locale]/(dashboard)/admin/page";

const authMock = jest.fn();
const redirectMock = jest.fn();
const connectDBMock = jest.fn();
const userCountDocumentsMock = jest.fn();
const userAggregateMock = jest.fn();
const jobCountDocumentsMock = jest.fn();
const jobAggregateMock = jest.fn();
const applicationCountDocumentsMock = jest.fn();
const applicationAggregateMock = jest.fn();
const interviewCountDocumentsMock = jest.fn();
const placementCountDocumentsMock = jest.fn();
const interviewAggregateMock = jest.fn();
const placementAggregateMock = jest.fn();

jest.mock("@/lib/auth/config", () => ({
  auth: () => authMock(),
}));

jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: () => connectDBMock(),
  connectDB: () => connectDBMock(),
}));

/**
 * The "needs attention" card is no longer a hardcoded ladder: it renders the
 * top of the shared platform-alert engine, ordered critical first. Mocking the
 * engine keeps this test about the page and lets it assert the ranking — the
 * previous implementation resolved to "review the audit logs" on any healthy
 * platform, which is not a task.
 */
const platformAlertsMock = jest.fn();
jest.mock("@/lib/admin/platformAlerts.server", () => ({
  getPlatformAlerts: () => platformAlertsMock(),
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => userCountDocumentsMock(...args),
    aggregate: (...args: unknown[]) => userAggregateMock(...args),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => jobCountDocumentsMock(...args),
    aggregate: (...args: unknown[]) => jobAggregateMock(...args),
  },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => applicationCountDocumentsMock(...args),
    aggregate: (...args: unknown[]) => applicationAggregateMock(...args),
  },
}));

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => interviewCountDocumentsMock(...args),
    aggregate: (...args: unknown[]) => interviewAggregateMock(...args),
  },
}));

jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => placementCountDocumentsMock(...args),
    aggregate: (...args: unknown[]) => placementAggregateMock(...args),
  },
}));

jest.mock("@/app/[locale]/(dashboard)/admin/_components/platform-health", () => ({
  BadgeSkeleton: () => null,
  InsightTextSkeleton: () => null,
  PlatformInsightsSkeleton: () => null,
  KpiActiveJobsInsightText: () => <span>Active jobs are healthy</span>,
  QuickActionHealthBadge: () => <span>Healthy</span>,
  PlatformInsightsSection: () => <div>Employer is still the dominant cohort</div>,
}));

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    connectDBMock.mockReset();
    userCountDocumentsMock.mockReset();
    userAggregateMock.mockReset();
    jobCountDocumentsMock.mockReset();
    jobAggregateMock.mockReset();
    applicationCountDocumentsMock.mockReset();
    applicationAggregateMock.mockReset();
    interviewCountDocumentsMock.mockReset();
    placementCountDocumentsMock.mockReset();

    authMock.mockResolvedValue({
      user: {
        id: "admin-1",
      },
    });
    connectDBMock.mockResolvedValue(undefined);
    userCountDocumentsMock
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);
    jobCountDocumentsMock
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    applicationCountDocumentsMock
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    interviewCountDocumentsMock.mockResolvedValue(4);
    placementCountDocumentsMock.mockResolvedValue(2);

    userAggregateMock
      .mockResolvedValueOnce([
        { _id: "employer", count: 8 },
        { _id: "job_seeker", count: 5 },
        { _id: "agent", count: 4 },
        { _id: "admin", count: 3 },
      ])
      .mockResolvedValueOnce([
        { _id: "user-1", name: "Sara Ahmed", role: "employer", createdAt: "2026-04-15T10:00:00.000Z" },
        { _id: "user-2", name: "Nadia Ali", role: "agent", createdAt: "2026-04-13T10:00:00.000Z" },
      ]);

    jobAggregateMock
      .mockResolvedValueOnce([
        { _id: { year: 2026, month: 1 }, count: 1 },
        { _id: { year: 2026, month: 2 }, count: 2 },
        { _id: { year: 2026, month: 3 }, count: 2 },
        { _id: { year: 2026, month: 4 }, count: 3 },
      ])
      .mockResolvedValueOnce([
        { _id: "job-1", title: "Senior Recruiter", status: "active", createdAt: "2026-04-14T10:00:00.000Z" },
        { _id: "job-2", title: "Sales Manager", status: "draft", createdAt: "2026-04-12T10:00:00.000Z" },
      ]);

    applicationAggregateMock
      .mockResolvedValueOnce([
        { _id: { year: 2026, month: 1 }, count: 2 },
        { _id: { year: 2026, month: 2 }, count: 3 },
        { _id: { year: 2026, month: 3 }, count: 4 },
        { _id: { year: 2026, month: 4 }, count: 5 },
      ])
      .mockResolvedValueOnce([
        { _id: "application-1", status: "applied", appliedAt: "2026-04-16T08:00:00.000Z", createdAt: "2026-04-16T08:00:00.000Z" },
        { _id: "application-2", status: "interview_scheduled", appliedAt: "2026-04-11T08:00:00.000Z", createdAt: "2026-04-11T08:00:00.000Z" },
      ]);

    interviewAggregateMock.mockResolvedValue([
      { _id: "interview-1", status: "scheduled", createdAt: "2026-04-16T09:00:00.000Z" },
    ]);
    placementAggregateMock.mockResolvedValue([
      { _id: "placement-1", status: "active", createdAt: "2026-04-15T09:00:00.000Z" },
    ]);
    platformAlertsMock.mockResolvedValue([
      { id: "stale-open-applications", level: "critical", values: { count: 7 } },
      { id: "jobs-without-applications", level: "warning", values: { count: 3 } },
    ]);
  });

  it("renders the admin dashboard with key sections and data", async () => {
    const { container } = render(await AdminDashboardPage({ params: Promise.resolve({ locale: "en" }) }));

    // Core headings. The "Admin workspace" eyebrow above the title was dropped —
    // it restated the sidebar section the user had just clicked. The h1 is now
    // a time-of-day greeting, so match whichever one the clock produces.
    expect(screen.getByRole("heading", { name: /good (morning|afternoon|evening)/i })).toBeInTheDocument();
    // "Recommended next" and "Platform at a glance" were renamed in the
    // dashboard declutter to "Needs attention" and "Overview".
    expect(screen.getByRole("heading", { name: /^needs attention$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^overview$/i })).toBeInTheDocument();

    // Key sections exist
    expect(screen.getByRole("heading", { name: /quick actions/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recent activity/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /hiring funnel/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /jobs vs applications/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /users by role/i })).toBeInTheDocument();

    // Data from mocks renders (dominant role is computed inline from usersByRole;
    // the "zero applications" KPI insight now streams from its own Suspense
    // subcomponent with a separate data source, so it isn't asserted here)
    expect(screen.getByText(/employer is still the dominant cohort/i)).toBeInTheDocument();
    expect(screen.getByText(/sara ahmed joined as employer/i)).toBeInTheDocument();
    expect(container.querySelector(".admin-quick-actions-grid")).toBeInTheDocument();
    // Quick actions render as linked rows now, not clipped cards, so the old
    // overflow-hidden assertion no longer describes them.
    expect(container.querySelectorAll(".admin-quick-actions-grid > a").length).toBeGreaterThan(0);
  });

  it("promotes the most severe platform alert as the next action, and links it to the filtered list", async () => {
    const { container } = render(await AdminDashboardPage({ params: Promise.resolve({ locale: "en" }) }));

    // The critical alert wins over the warning whatever order the engine
    // returned them in, and its link carries the filter that narrows the
    // destination to the rows the alert counted — a bare /admin/applications
    // link loses the finding on arrival.
    const nextAction = screen.getByRole("heading", { name: /^needs attention$/i }).closest("section");
    const primaryLink = nextAction?.querySelector('a[href*="stale=true"]');
    expect(primaryLink).toBeTruthy();
    expect(primaryLink?.getAttribute("href")).toBe("/en/admin/applications?stale=true");
  });

  it("shows the remaining alerts instead of hiding them behind the first", async () => {
    render(await AdminDashboardPage({ params: Promise.resolve({ locale: "en" }) }));

    const secondary = screen.getByRole("heading", { name: /also needs attention/i }).closest("section");
    expect(secondary).toBeTruthy();
    // The second alert is reachable, not buried behind the first.
    expect(secondary?.querySelector('a[href="/en/admin/jobs?applications=none"]')).toBeTruthy();
  });
});
