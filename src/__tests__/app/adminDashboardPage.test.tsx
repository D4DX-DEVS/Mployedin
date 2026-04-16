/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
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

jest.mock("@/lib/auth/config", () => ({
  auth: () => authMock(),
}));

jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: () => connectDBMock(),
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
  },
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
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([
        { _id: { year: 2026, month: 1 }, count: 1 },
        { _id: { year: 2026, month: 2 }, count: 2 },
        { _id: { year: 2026, month: 3 }, count: 2 },
        { _id: { year: 2026, month: 4 }, count: 3 },
      ])
      .mockResolvedValueOnce([
        { _id: "job-1", title: "Senior Recruiter", status: "active", approvalStatus: "approved", createdAt: "2026-04-14T10:00:00.000Z" },
        { _id: "job-2", title: "Sales Manager", status: "pending_approval", approvalStatus: "pending", createdAt: "2026-04-12T10:00:00.000Z" },
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
  });

  it("renders the admin dashboard as an insight-driven control center", async () => {
    render(await AdminDashboardPage({ params: Promise.resolve({ locale: "en" }) }));

    const workspaceBadge = screen.getByText(/admin workspace/i);
    const heroSection = workspaceBadge.closest("section");
    const quickActionsSection = screen.getByRole("heading", { name: /quick actions/i }).closest("section");
    const jobsVsApplicationsSection = screen.getByRole("heading", { name: /jobs vs applications/i }).closest("section");
    const jobsInsightCard = screen
      .getByRole("heading", { name: /3 active jobs are missing applicant demand/i })
      .closest("article");
    const pendingBadge = screen.getByText(/2 pending/i);
    const jobsLegend = jobsVsApplicationsSection
      ? within(jobsVsApplicationsSection).getByText("Jobs").closest("span")
      : null;
    const applicationsLegend = jobsVsApplicationsSection
      ? within(jobsVsApplicationsSection).getByText("Applications").closest("span")
      : null;

    expect(heroSection).toHaveClass("workspace-hero-surface");
    expect(workspaceBadge).toHaveClass("workspace-glass-panel");
    expect(heroSection).toHaveAttribute("data-surface", "light-hero");
    expect(screen.getByRole("heading", { name: /admin dashboard/i })).toHaveClass("text-foreground");
    expect(screen.getByText(/platform overview, approval pressure/i)).toHaveClass("text-muted-foreground");
    expect(screen.getByRole("heading", { name: /platform insights/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recent activity/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /jobs vs applications/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /hiring funnel/i })).toBeInTheDocument();
    expect(screen.getAllByText(/dominant user group/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/3 active roles still have zero applications/i)).toBeInTheDocument();
    expect(screen.getByText(/sara ahmed joined as employer/i)).toBeInTheDocument();
    expect(quickActionsSection).toHaveClass("workspace-panel-surface");
    expect(quickActionsSection).toHaveAttribute("data-surface", "light-panel");
    expect(screen.getByRole("link", { name: /job approvals/i })).toBeInTheDocument();
    expect(jobsInsightCard).toHaveAttribute("data-surface", "light-card");
    expect(jobsInsightCard).toHaveAttribute("data-tone", "warning");
    expect(pendingBadge).toHaveClass("text-amber-900");
    expect(jobsLegend).toHaveClass("bg-blue-50", "text-blue-800");
    expect(applicationsLegend).toHaveClass("bg-violet-50", "text-violet-800");
  });
});