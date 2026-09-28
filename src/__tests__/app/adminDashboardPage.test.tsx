/**
 * @jest-environment jsdom
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import AdminDashboardPage from "@/app/[locale]/(dashboard)/admin/page";
import {
  FinanceSection,
  HealthSection,
  InsightsSection,
  PeopleSection,
  QueueSection,
  RecentSection,
  RecruitmentSection,
  RevenueSection,
  SnapshotSection,
  TopEmployersSection,
  TrendSection,
  type SectionContext,
} from "@/app/[locale]/(dashboard)/admin/_components/sections";
import { buildAdminQueue } from "@/lib/admin/actionQueue";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import type { DataInsight } from "@/lib/admin/dashboard/insights.server";
import type { DashboardTrends } from "@/lib/admin/dashboard/trends.server";
import type { FinanceOverview, HealthCheck, PeopleOverview, PlatformSnapshot, RecentEvent, RecruitmentOverview } from "@/lib/admin/dashboard/types";
import type { Resource } from "@/types/user";

const authMock = jest.fn();
const redirectMock = jest.fn();
const refreshMock = jest.fn();
const queueMock = jest.fn();
const snapshotMock = jest.fn();
const recruitmentMock = jest.fn();
const peopleMock = jest.fn();
const financeMock = jest.fn();
const healthMock = jest.fn();
const recentMock = jest.fn();
const trendsMock = jest.fn();
const insightsMock = jest.fn();

jest.mock("@/lib/auth/config", () => ({ auth: () => authMock() }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ replace: jest.fn(), refresh: refreshMock, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
// Recharts measures its container; jsdom has no layout, so the charts render as inert boxes.
jest.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <svg data-chart>{children}</svg>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box, AreaChart: Box, PieChart: Box, Area: Nothing, Pie: Nothing, Cell: Nothing,
    CartesianGrid: Nothing, XAxis: Nothing, YAxis: Nothing, Tooltip: Nothing,
  };
});

/* The data layer is mocked at its boundary: these tests cover what each section
   renders from its data and which permission and period it hands the loaders. */
jest.mock("@/lib/admin/actionQueue.server", () => ({ getAdminActionQueue: (can: unknown) => queueMock(can) }));
jest.mock("@/lib/admin/dashboard/snapshot.server", () => ({ getPlatformSnapshot: (period: unknown) => snapshotMock(period) }));
jest.mock("@/lib/admin/dashboard/recruitment.server", () => ({ getRecruitmentOverview: (period: unknown) => recruitmentMock(period) }));
jest.mock("@/lib/admin/dashboard/people.server", () => ({ getPeopleOverview: (period: unknown, access: unknown) => peopleMock(period, access) }));
jest.mock("@/lib/admin/dashboard/finance.server", () => ({ getFinanceOverview: (period: unknown, access: unknown) => financeMock(period, access) }));
jest.mock("@/lib/admin/dashboard/health.server", () => ({ getHealthChecks: (period: unknown) => healthMock(period) }));
jest.mock("@/lib/admin/dashboard/recent.server", () => ({ getRecentEvents: (categories: unknown) => recentMock(categories) }));
jest.mock("@/lib/admin/dashboard/trends.server", () => ({ getDashboardTrends: (period: unknown) => trendsMock(period) }));
jest.mock("@/lib/admin/dashboard/insights.server", () => ({ getDataInsights: (period: unknown) => insightsMock(period) }));

const NOW = new Date("2026-09-24T10:00:00.000Z");
const period = resolveDashboardPeriod("30d", NOW);

const snapshot: PlatformSnapshot = {
  users: { total: 397, added: { current: 24, previous: 20 } },
  activeJobs: { total: 68, added: { current: 12, previous: 0 } },
  applications: { total: 180, added: { current: 35, previous: 50 } },
  interviews: { total: 25, added: { current: 9, previous: 9 } },
  placements: { total: 9, added: { current: 0, previous: 0 } },
};

const trends: DashboardTrends = {
  daily: [
    { day: "2026-09-22", users: 2, jobs: 1, applications: 5, placements: 0 },
    { day: "2026-09-23", users: 3, jobs: 0, applications: 8, placements: 1 },
    { day: "2026-09-24", users: 1, jobs: 2, applications: 4, placements: 0 },
  ],
  revenue: [
    { month: "2026-08", currency: "AED", collected: 12000 },
    { month: "2026-09", currency: "AED", collected: 8000 },
  ],
  primaryCurrency: "AED",
  topEmployers: [
    { id: "e1", name: "Acme Gulf", activeJobs: 4, applications: 27 },
    { id: "e2", name: "Beta Co", activeJobs: 1, applications: 3 },
  ],
};

const recruitment: RecruitmentOverview = {
  pipeline: [
    { status: "applied", count: 21 },
    { status: "shortlisted", count: 12 },
    { status: "interview_scheduled", count: 9 },
    { status: "selected", count: 3 },
    { status: "offer", count: 2 },
    { status: "hired", count: 3 },
    { status: "rejected", count: 12 },
    { status: "withdrawn", count: 3 },
  ],
  jobs: { activeJobs: 68, lowVolume: 22, expiringSoon: 6, paused: 7, drafts: 21, expiredInPeriod: 12 },
  funnel: { applications: 65, reachedInterview: 20, reachedOffer: 8, hired: 3, avgHoursToFirstReview: 72, avgDaysToHire: null },
};

const people: PeopleOverview = {
  usersByRole: [
    { role: "job_seeker", count: 238 },
    { role: "employer", count: 136 },
    { role: "agent", count: 15 },
    { role: "super_agent", count: 4 },
    { role: "other", count: 4 },
  ],
  employers: { companies: 123, accounts: 128, accountsActive7d: 6, accountsInactive7d: 122, newCompaniesInPeriod: 31, withoutActiveJob: 96, activeJobsButNoApplications: 13 },
  agents: { activeAgents: 14, signedInThisWeek: 1, notSignedInThisWeek: 13, targets: { behind: 4, onPace: 2, achieved: 1 }, candidatesSourced: 2, interviewsArranged: 0, placements: 0 },
};

const finance: FinanceOverview = {
  money: [
    { currency: "AED", outstanding: 46500, overdue: 3200, collected: 8000 },
    { currency: "INR", outstanding: 1400, overdue: 0, collected: 0 },
  ],
  invoiceStatuses: [
    { status: "issued", count: 84 },
    { status: "overdue", count: 1 },
    { status: "void", count: 0 },
  ],
  totalInvoices: 85,
  openDisputes: 0,
  activeSubscriptions: 130,
  plans: [
    { role: "employer", name: "Gold", tier: 2, count: 43 },
    { role: "job_seeker", name: "Basic", tier: 1, count: 8 },
  ],
  expiredInPeriod: 1,
  cancelledInPeriod: 0,
  payments: null,
};

const health: HealthCheck[] = [
  { id: "database", status: "healthy", value: 42, path: "/admin/system-health" },
  { id: "email", status: "warning", value: 2, path: "/admin/settings/notifications?tab=email-logs&status=failed" },
  { id: "webhooks", status: "critical", value: 3, path: "/admin/webhooks?status=failing" },
  { id: "authentication", status: "healthy", value: 0, secondary: 3, path: "/admin/audit-logs?action=login.failed" },
];

const recent: RecentEvent[] = [
  { id: "user-1", kind: "user", category: "users", subject: "Sara Ahmed", role: "employer", at: "2026-09-24T08:00:00.000Z" },
  { id: "job-1", kind: "job", category: "jobs", subject: "Senior Recruiter", status: "active", at: "2026-09-23T08:00:00.000Z" },
  { id: "invoice-paid-1", kind: "invoice_paid", category: "finance", subject: "INV-0042", at: "2026-09-22T08:00:00.000Z" },
];

const insights: DataInsight[] = [
  { id: "seekers-incomplete-profile", count: 11, severity: "warning", path: "/admin/job-seekers" },
  { id: "jobs-expiring-7d", count: 2, severity: "warning", path: "/admin/jobs?status=active" },
];

const allowAll = () => true;
const ctx = (can: (resource: Resource) => boolean = allowAll): SectionContext => ({ can, period, locale: "en" });
const only = (...resources: Resource[]) => (resource: Resource) => resources.includes(resource);

async function show(section: Promise<ReactElement | null>) {
  return render(<>{await section}</>);
}

const panel = (id: string) => document.getElementById(id) as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  queueMock.mockResolvedValue(
    buildAdminQueue({ "exhibitions-under-review": 3, "invoices-overdue": 4, "payment-notices": 1, "support-tickets": 0, "applications-awaiting-review": 7 }),
  );
  snapshotMock.mockResolvedValue(snapshot);
  recruitmentMock.mockResolvedValue(recruitment);
  peopleMock.mockResolvedValue(people);
  financeMock.mockResolvedValue(finance);
  healthMock.mockResolvedValue(health);
  recentMock.mockResolvedValue(recent);
  trendsMock.mockResolvedValue(trends);
  insightsMock.mockResolvedValue(insights);
});

describe("Needs your action", () => {
  it("lists items most urgent first and links each to the list it counted", async () => {
    await show(QueueSection(ctx()));
    const rows = Array.from(panel("admin-action-queue").querySelectorAll("a[data-queue-id]"));
    expect(rows.map((a) => a.getAttribute("href"))).toEqual([
      "/en/admin/invoices?status=overdue",
      "/en/admin/exhibitions?status=under_review",
      "/en/admin/invoices?attention=payment_notice",
      "/en/admin/applications?stale=true",
    ]);
    expect(rows[1].textContent).toContain("exhibition requests under review");
    expect(rows[0].getAttribute("data-level")).toBe("critical");
    expect(within(rows[0] as HTMLElement).getByText(/critical/i)).toBeInTheDocument();
  });

  it("says all clear when nothing is waiting instead of listing zeros", async () => {
    queueMock.mockResolvedValue([]);
    await show(QueueSection(ctx()));
    expect(panel("admin-action-queue").querySelectorAll("a[data-queue-id]")).toHaveLength(0);
    expect(screen.getByText(/approvals, payments and requests will appear here/i)).toBeInTheDocument();
  });

  it("hides areas the admin cannot act on and skips the section when none are left", async () => {
    await show(QueueSection(ctx(only("invoices"))));
    // Invoices sit in both the decisions and the finance areas.
    expect(panel("admin-action-queue").querySelectorAll("[data-queue-group]")).toHaveLength(2);
    expect(queueMock).toHaveBeenCalledTimes(1);
    expect(await QueueSection(ctx(only("cms")))).toBeNull();
  });

  it("shows an error with a retry in place when its queries fail", async () => {
    queueMock.mockRejectedValue(new Error("boom"));
    await show(QueueSection(ctx()));
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("Headline numbers", () => {
  it("shows each total with its period change and links to the list it counts", async () => {
    await show(SnapshotSection(ctx()));
    const strip = document.querySelector("[data-kpi-strip]") as HTMLElement;
    const links = Array.from(strip.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/en/admin/users",
      "/en/admin/employers",
      "/en/admin/jobs?status=active",
      "/en/admin/applications",
      "/en/admin/placements",
      "/en/admin/invoices?status=paid",
    ]);
    expect(within(strip).getByText("397")).toBeInTheDocument();
    expect(within(strip).getByLabelText(/up 20% vs previous 30 days/i)).toBeInTheDocument();
    expect(within(strip).getByText("AED 8,000")).toBeInTheDocument();
    expect(snapshotMock).toHaveBeenCalledWith(period);
  });

  it("shows only the tiles the admin may open", async () => {
    await show(SnapshotSection(ctx(only("users", "jobs"))));
    const strip = document.querySelector("[data-kpi-strip]") as HTMLElement;
    expect(strip.querySelectorAll("a")).toHaveLength(2);
    expect(peopleMock).not.toHaveBeenCalled();
    expect(financeMock).not.toHaveBeenCalled();
  });
});

describe("Activity trend", () => {
  it("renders the period's daily series for the areas the admin may read", async () => {
    await show(TrendSection(ctx(only("users", "applications"))));
    const trend = panel("admin-trend");
    expect(within(trend).getByText("New users")).toBeInTheDocument();
    expect(within(trend).getByText("Applications")).toBeInTheDocument();
    expect(within(trend).queryByText("Jobs posted")).not.toBeInTheDocument();
    expect(trendsMock).toHaveBeenCalledWith(period);
  });
});

describe("Recruitment", () => {
  it("links every pipeline status and converts stage to stage", async () => {
    await show(RecruitmentSection(ctx()));
    const pipeline = panel("admin-pipeline");
    const hrefs = Array.from(pipeline.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/en/admin/applications?status=interview_scheduled");
    expect(hrefs).toContain("/en/admin/applications?status=hired");
    const funnel = panel("admin-funnel");
    expect(within(funnel).getByText("31%")).toBeInTheDocument(); // 20 of 65 reached interview
    expect(within(funnel).getByText("72 h")).toBeInTheDocument();
    expect(within(funnel).getByText(/not enough data yet/i)).toBeInTheDocument();
    expect(panel("admin-job-health")).toBeInTheDocument();
  });

  it("drops job health for an admin who cannot read jobs", async () => {
    await show(RecruitmentSection(ctx(only("applications"))));
    expect(document.getElementById("admin-job-health")).toBeNull();
    expect(panel("admin-pipeline")).toBeInTheDocument();
  });
});

describe("Money", () => {
  it("charts collected payments in the busiest currency and totals the year", async () => {
    await show(RevenueSection(ctx()));
    const revenue = panel("admin-revenue");
    expect(within(revenue).getByText("AED 20,000")).toBeInTheDocument();
    expect(await RevenueSection(ctx(only("users")))).toBeNull();
  });

  it("links each invoice status and keeps money per currency", async () => {
    await show(FinanceSection(ctx()));
    const invoices = panel("admin-invoices");
    expect(within(invoices).getByRole("link", { name: /issued/i })).toHaveAttribute("href", "/en/admin/invoices?status=issued");
    expect(within(invoices).getByText("AED 46,500")).toBeInTheDocument();
    expect(within(panel("admin-subscriptions")).getByText(/gold · employers/i)).toBeInTheDocument();
    expect(financeMock).toHaveBeenCalledWith(period, { commissions: true });
  });

  it("ranks employers by applications in the period", async () => {
    await show(TopEmployersSection(ctx()));
    const rows = panel("admin-top-employers").querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Acme Gulf");
    expect(rows[0].textContent).toContain("27");
  });
});

describe("People", () => {
  it("links each role to the users list filtered to it and asks only for permitted panels", async () => {
    await show(PeopleSection(ctx(only("users", "employers"))));
    expect(within(panel("admin-users-by-role")).getByRole("link", { name: /employer/i })).toHaveAttribute("href", "/en/admin/users?role=employer");
    expect(panel("admin-employers")).toBeInTheDocument();
    expect(document.getElementById("admin-agents")).toBeNull();
    expect(peopleMock).toHaveBeenCalledWith(period, { employers: true, agents: false });
  });
});

describe("Quick findings", () => {
  it("lists each data gap with its count and a link", async () => {
    await show(InsightsSection(ctx()));
    const links = panel("admin-insights").querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toContain("Job seekers with profile under 50% complete");
    expect(links[0].textContent).toContain("11");
  });

  it("says so when nothing is missing", async () => {
    insightsMock.mockResolvedValue([]);
    await show(InsightsSection(ctx()));
    expect(screen.getByText(/no data gaps found/i)).toBeInTheDocument();
  });
});

describe("System health", () => {
  it("names each status in words and links to where it is fixed", async () => {
    await show(HealthSection(ctx()));
    const webhooks = panel("admin-health").querySelector('[data-health-id="webhooks"] a') as HTMLElement;
    expect(webhooks).toHaveAttribute("href", "/en/admin/webhooks?status=failing");
    expect(within(webhooks).getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText(/2 checks need a look/i)).toBeInTheDocument();
  });

  it("uses the system-health page's permission", async () => {
    expect(await HealthSection(ctx(only("users")))).toBeNull();
    expect(healthMock).not.toHaveBeenCalled();
  });
});

describe("Recent platform activity", () => {
  it("queries and offers only the areas the admin may read", async () => {
    await show(RecentSection(ctx(only("users", "jobs"))));
    expect(recentMock).toHaveBeenCalledWith(new Set(["users", "jobs"]));
    expect(screen.getByText(/sara ahmed joined as employer/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finance/i })).not.toBeInTheDocument();
  });
});

describe("AdminDashboardPage", () => {
  /** The section elements the page streams, with the context each receives. */
  function sectionContexts(node: ReactNode, found: SectionContext[] = []): SectionContext[] {
    if (Array.isArray(node)) node.forEach((child) => sectionContexts(child, found));
    else if (isValidElement<{ children?: ReactNode; fallback?: ReactNode } & Partial<SectionContext>>(node)) {
      if (typeof node.props.can === "function") found.push(node.props as SectionContext);
      sectionContexts(node.props.children, found);
    }
    return found;
  }

  async function page(periodParam?: string) {
    return AdminDashboardPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve(periodParam ? { period: periodParam } : {}),
    });
  }

  it("streams every section with the period from the URL, falling back to 30 days", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin", name: "Super Admin" } });
    const contexts = sectionContexts(await page("7d"));
    expect(contexts).toHaveLength(11);
    expect(contexts.every((context) => context.period.key === "7d")).toBe(true);
    expect(sectionContexts(await page("365d"))[0].period.key).toBe("30d");
  });

  it("builds a permission check that honours custom-narrowed admins", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-2", role: "admin", permissionMode: "custom", customPermissions: { jobs: ["read"] } } });
    const [{ can }] = sectionContexts(await page());
    expect(can("jobs")).toBe(true);
    expect(can("invoices")).toBe(false);
  });

  it("redirects to login without a session", async () => {
    authMock.mockResolvedValue(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    await expect(page()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/en/login");
  });
});
