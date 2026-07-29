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
const placementCountDocumentsMock = jest.fn();

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

jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => placementCountDocumentsMock(...args),
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

  it("renders the admin dashboard with key sections and data", async () => {
    render(await AdminDashboardPage({ params: Promise.resolve({ locale: "en" }) }));

    // Core headings and workspace badge
    expect(screen.getByText(/admin workspace/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /admin dashboard/i })).toBeInTheDocument();

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
  });
});
