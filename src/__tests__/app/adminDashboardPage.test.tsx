/**
 * @jest-environment jsdom
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import AdminDashboardPage from "@/app/[locale]/(dashboard)/admin/page";
import {
  FinanceSection,
  HealthSection,
  PeopleSection,
  QueueSection,
  RecentSection,
  RecruitmentSection,
  SnapshotSection,
  type SectionContext,
} from "@/app/[locale]/(dashboard)/admin/_components/sections";
import { buildAdminQueue } from "@/lib/admin/actionQueue";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import type {
  FinanceOverview,
  HealthCheck,
  PeopleOverview,
  PlatformSnapshot,
  RecentEvent,
  RecruitmentOverview,
} from "@/lib/admin/dashboard/types";
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

jest.mock("@/lib/auth/config", () => ({ auth: () => authMock() }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ replace: jest.fn(), refresh: refreshMock, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

/* The data layer is mocked at its boundary: these tests cover what each section
   renders from its data and which permission and period it hands the loaders.
   The queries have their own tests. */
jest.mock("@/lib/admin/actionQueue.server", () => ({ getAdminActionQueue: (can: unknown) => queueMock(can) }));
jest.mock("@/lib/admin/dashboard/snapshot.server", () => ({ getPlatformSnapshot: (period: unknown) => snapshotMock(period) }));
jest.mock("@/lib/admin/dashboard/recruitment.server", () => ({ getRecruitmentOverview: (period: unknown) => recruitmentMock(period) }));
jest.mock("@/lib/admin/dashboard/people.server", () => ({
  getPeopleOverview: (period: unknown, access: unknown) => peopleMock(period, access),
}));
jest.mock("@/lib/admin/dashboard/finance.server", () => ({
  getFinanceOverview: (period: unknown, access: unknown) => financeMock(period, access),
}));
jest.mock("@/lib/admin/dashboard/health.server", () => ({ getHealthChecks: (period: unknown) => healthMock(period) }));
jest.mock("@/lib/admin/dashboard/recent.server", () => ({ getRecentEvents: (categories: unknown) => recentMock(categories) }));

const NOW = new Date("2026-09-24T10:00:00.000Z");
const period = resolveDashboardPeriod("30d", NOW);

const snapshot: PlatformSnapshot = {
  users: { total: 397, added: { current: 24, previous: 20 } },
  activeJobs: { total: 68, added: { current: 12, previous: 0 } },
  applications: { total: 180, added: { current: 35, previous: 50 } },
  interviews: { total: 25, added: { current: 9, previous: 9 } },
  placements: { total: 9, added: { current: 0, previous: 0 } },
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
  employers: {
    companies: 123,
    accounts: 128,
    accountsActive7d: 6,
    accountsInactive7d: 122,
    newCompaniesInPeriod: 31,
    withoutActiveJob: 96,
    activeJobsButNoApplications: 13,
  },
  agents: {
    activeAgents: 14,
    signedInThisWeek: 1,
    notSignedInThisWeek: 13,
    targets: { behind: 4, onPace: 2, achieved: 1 },
    candidatesSourced: 2,
    interviewsArranged: 0,
    placements: 0,
  },
};

const finance: FinanceOverview = {
  money: [
    { currency: "AED", outstanding: 46500, overdue: 3200, collected: 0 },
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
  payments: [
    { currency: "INR", awaitingVerification: 0, commissionPending: 0, commissionApproved: 50300, commissionDisputed: 0, commissionPaid: 0 },
  ],
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
  { id: "audit-1", kind: "system", category: "system", subject: "Omar", action: "settings.update", at: "2026-09-21T08:00:00.000Z" },
];

const allowAll = () => true;
const ctx = (can: (resource: Resource) => boolean = allowAll): SectionContext => ({ can, period, locale: "en" });
const only = (...resources: Resource[]) => (resource: Resource) => resources.includes(resource);

async function show(section: Promise<ReactElement | null>) {
  const element = await section;
  return render(<>{element}</>);
}

const sectionNamed = (name: RegExp) => screen.getByRole("heading", { name, level: 2 }).closest("section")!;

beforeEach(() => {
  jest.clearAllMocks();
  queueMock.mockResolvedValue(
    buildAdminQueue({
      "exhibitions-under-review": 3,
      "invoices-overdue": 4,
      "payment-notices": 1,
      "support-tickets": 0,
      "applications-awaiting-review": 7,
    }),
  );
  snapshotMock.mockResolvedValue(snapshot);
  recruitmentMock.mockResolvedValue(recruitment);
  peopleMock.mockResolvedValue(people);
  financeMock.mockResolvedValue(finance);
  healthMock.mockResolvedValue(health);
  recentMock.mockResolvedValue(recent);
});

describe("Needs your action", () => {
  it("lists items most urgent first and links each to the list it counted", async () => {
    await show(QueueSection(ctx()));
    const queue = sectionNamed(/^needs your action$/i);
    const rows = Array.from(queue.querySelectorAll("a[data-queue-id]"));
    expect(rows.map((a) => a.getAttribute("href"))).toEqual([
      "/en/admin/invoices?status=overdue",
      "/en/admin/exhibitions?status=under_review",
      "/en/admin/invoices?attention=payment_notice",
      "/en/admin/applications?stale=true",
    ]);
    expect(rows[1].textContent).toContain("3exhibition requests under review");
    // Level and area in words on every tile, not colour alone.
    expect(within(rows[0] as HTMLElement).getAllByText("Critical").length).toBeGreaterThan(0);
    expect(rows[1].textContent).toContain("Decisions");
    expect(queue.querySelector('[data-queue-id="invoices-overdue"]')?.getAttribute("data-level")).toBe("critical");
    // Zero counts are not rendered.
    expect(within(queue).queryByText(/support ticket/i)).not.toBeInTheDocument();
    expect(within(queue).getByText("4 items need action")).toBeInTheDocument();
    // Every area keeps its chip; one with nothing waiting says so.
    const compliance = queue.querySelector('[data-queue-group="compliance"]') as HTMLElement;
    expect(within(compliance).getByLabelText("Nothing waiting here.")).toBeInTheDocument();
  });

  it("stretches the last tile over the rest of its row", async () => {
    await show(QueueSection(ctx()));
    const tiles = Array.from(sectionNamed(/^needs your action$/i).querySelectorAll("a[data-queue-id]")).map((a) => a.parentElement!);
    // Four tiles: 3 + 1 at three columns, so the last spans all three.
    expect(tiles[3].className).toContain("xl:col-span-3");
    expect(tiles[2].className).not.toContain("col-span");
  });

  it("says all clear when nothing is waiting instead of listing zeros", async () => {
    queueMock.mockResolvedValue([]);
    await show(QueueSection(ctx()));
    expect(screen.getByText(/nothing is waiting on you right now/i)).toBeInTheDocument();
  });

  it("hides areas the admin cannot act on and skips the section when none are left", async () => {
    await show(QueueSection(ctx(only("jobs", "applications"))));
    expect(document.querySelector('[data-queue-group="finance"]')).toBeNull();
    expect(document.querySelector('[data-queue-group="recruitment"]')).toBeTruthy();

    expect(await QueueSection(ctx(() => false))).toBeNull();
    expect(queueMock).toHaveBeenCalledTimes(1);
  });

  it("shows an error with a retry in place when its queries fail", async () => {
    queueMock.mockRejectedValue(new Error("boom"));
    await show(QueueSection(ctx()));
    const failed = sectionNamed(/^needs your action$/i);
    expect(within(failed).getByRole("alert")).toHaveTextContent("We couldn't load this section. Please try again.");
    fireEvent.click(within(failed).getByRole("button", { name: /try again/i }));
    expect(refreshMock).toHaveBeenCalled();
  });
});

describe("Platform snapshot", () => {
  it("gives each total its scope, what was added, and the change against the period before", async () => {
    await show(SnapshotSection(ctx()));
    const panel = sectionNamed(/^platform snapshot$/i);
    expect(within(panel).getAllByText("24 new in 30 days").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Up 20% vs previous 30 days")).toBeInTheDocument();
    expect(within(panel).getByText("Down 30% vs previous 30 days")).toBeInTheDocument();
    expect(within(panel).getByText("No change vs previous 30 days")).toBeInTheDocument();
    // No previous figure: say so rather than print an infinite percentage.
    expect(within(panel).getByText("None in the previous 30 days")).toBeInTheDocument();
    expect(within(panel).getByText("None in either period")).toBeInTheDocument();
    expect(panel.querySelector('[data-snapshot="activeJobs"] a')?.getAttribute("href")).toBe("/en/admin/jobs?status=active");
    // Jobs created in the period include drafts, so they are not called "opened".
    expect(within(panel).getAllByText("12 created in 30 days").length).toBeGreaterThan(0);
    expect(snapshotMock).toHaveBeenCalledWith(period);
  });

  it("gives the change as a count, not a percentage, over a tiny previous period", async () => {
    snapshotMock.mockResolvedValue({
      ...snapshot,
      applications: { total: 82, added: { current: 42, previous: 1 } },
      interviews: { total: 25, added: { current: 2, previous: 5 } },
    });
    await show(SnapshotSection(ctx()));
    const panel = sectionNamed(/^platform snapshot$/i);
    expect(within(panel).getByText("41 more than previous 30 days")).toBeInTheDocument();
    expect(within(panel).getByText("3 fewer than previous 30 days")).toBeInTheDocument();
    expect(within(panel).getByText("+41")).toBeInTheDocument();
    expect(panel.textContent).not.toContain("4100%");
  });

  it("shows only the totals the admin may open", async () => {
    await show(SnapshotSection(ctx(only("users", "jobs"))));
    expect(Array.from(document.querySelectorAll("[data-snapshot]")).map((el) => el.getAttribute("data-snapshot"))).toEqual(["users", "activeJobs"]);
  });
});

describe("Recruitment overview", () => {
  it("links every pipeline status and converts stage to stage", async () => {
    await show(RecruitmentSection(ctx()));
    const panel = sectionNamed(/^recruitment overview$/i);
    expect(panel.querySelector('a[href="/en/admin/applications?status=interview_scheduled"]')).toBeTruthy();
    expect(panel.querySelector('a[href="/en/admin/applications?status=withdrawn"]')).toBeTruthy();
    // 20 of 65 reached interview, 8 of 20 an offer, 3 of 8 were hired.
    expect(within(panel).getByText("30.8%")).toBeInTheDocument();
    expect(within(panel).getByText("40%")).toBeInTheDocument();
    expect(within(panel).getByText("37.5%")).toBeInTheDocument();
    // The funnel counts stages ever reached, and says so, unlike the pipeline's current status.
    expect(within(panel).getByText("65 applications by current status")).toBeInTheDocument();
    expect(within(panel).getByText("Stages ever reached by 65 applications, not their current status")).toBeInTheDocument();
    expect(within(panel).getByText("20 of 65 applications reached interview")).toBeInTheDocument();
    expect(within(panel).getByText("8 of 20 interviewed got an offer")).toBeInTheDocument();
    expect(within(panel).getByText("3 of 8 offers led to a hire")).toBeInTheDocument();
    // 72 hours reads as days; a missing average says so instead of showing 0.
    expect(within(panel).getByText("3 d")).toBeInTheDocument();
    expect(within(panel).getByText("Not enough data yet")).toBeInTheDocument();
  });

  it("links job-health rows only where a list filters to exactly those jobs", async () => {
    await show(RecruitmentSection(ctx()));
    const panel = sectionNamed(/^recruitment overview$/i);
    expect(panel.querySelector('[data-stat="jobs-expiring"] a')?.getAttribute("href")).toBe("/en/admin/jobs?expiring=7d");
    expect(panel.querySelector('[data-stat="jobs-low-volume"] a')).toBeNull();
    // "No applications" is an action-queue count and is not repeated here.
    expect(within(panel).queryByText(/no applications/i)).not.toBeInTheDocument();
  });

  it("drops job health for an admin who cannot read jobs", async () => {
    await show(RecruitmentSection(ctx(only("applications"))));
    expect(screen.queryByRole("heading", { name: /^job health$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^hiring funnel$/i })).toBeInTheDocument();
  });
});

describe("People & network", () => {
  it("links each role to the users list filtered to it", async () => {
    await show(PeopleSection(ctx()));
    const panel = sectionNamed(/^people & network$/i);
    expect(panel.querySelector('[data-role="job_seeker"] a')?.getAttribute("href")).toBe("/en/admin/users?role=job_seeker");
    // Admins and legacy roles have no single filter, so "Other" is not a link.
    expect(panel.querySelector('[data-role="other"] a')).toBeNull();
    expect(panel.querySelector('[data-stat="employers-inactive"]')?.textContent).toContain("122");
    // Sign-in rows count accounts, not companies: the header names both populations.
    expect(within(panel).getByText("123 companies · 128 active accounts")).toBeInTheDocument();
    expect(panel.querySelector('[data-stat="employers-inactive"]')?.textContent).toContain("95%");
    expect(within(panel).getByText("4 below target")).toBeInTheDocument();
    expect(peopleMock).toHaveBeenCalledWith(period, { employers: true, agents: true });
  });

  it("asks only for the panels the admin may read", async () => {
    peopleMock.mockResolvedValue({ ...people, agents: null });
    await show(PeopleSection(ctx(only("users", "employers"))));
    expect(peopleMock).toHaveBeenCalledWith(period, { employers: true, agents: false });
    expect(screen.queryByRole("heading", { name: /^agent operations$/i })).not.toBeInTheDocument();
  });
});

describe("Finance & subscriptions", () => {
  it("keeps money per currency and links each invoice status and payment amount", async () => {
    await show(FinanceSection(ctx()));
    const panel = sectionNamed(/^finance & subscriptions$/i);
    expect(within(panel).getByRole("rowheader", { name: "AED" })).toBeInTheDocument();
    // Actionable statuses live in Needs your action only — Finance shows informational states.
    expect(panel.querySelector('[data-invoice-status="issued"] a')?.getAttribute("href")).toBe("/en/admin/invoices?status=issued");
    expect(panel.querySelector('[data-invoice-status="overdue"]')).toBeNull();
    expect(panel.querySelector('[data-invoice-status="pending_approval"]')).toBeNull();
    // Empty statuses are left out.
    expect(panel.querySelector('[data-invoice-status="void"]')).toBeNull();
    expect(panel.querySelector('[data-payment-row="commissionApproved"] a')?.getAttribute("href")).toBe("/en/admin/commissions?status=approved");
    expect(financeMock).toHaveBeenCalledWith(period, { commissions: true });
  });

  it("lets payments take the row alone when subscriptions are hidden", async () => {
    await show(FinanceSection(ctx(only("invoices", "commissions"))));
    expect(screen.queryByRole("heading", { name: /^subscriptions by plan$/i })).not.toBeInTheDocument();
    const payments = screen.getByRole("heading", { name: /^payments & commissions$/i, level: 3 }).closest("[data-surface]");
    expect(payments?.className).toContain("md:col-span-2");
  });
});

describe("System health", () => {
  it("names each status in words and links to where it is fixed", async () => {
    await show(HealthSection(ctx()));
    const panel = sectionNamed(/^system health$/i);
    expect(within(panel).getByText("2 checks need a look.")).toBeInTheDocument();
    const webhooks = panel.querySelector('[data-health-id="webhooks"]') as HTMLElement;
    expect(within(webhooks).getByText("Critical")).toBeInTheDocument();
    const auth = panel.querySelector('[data-health-id="authentication"]') as HTMLElement;
    expect(within(auth).getByText("No locked accounts · 3 failed sign-ins in 24 hours")).toBeInTheDocument();
    expect(auth.querySelector("a")?.getAttribute("href")).toBe("/en/admin/audit-logs?action=login.failed");
  });

  it("uses the system-health page's permission", async () => {
    expect(await HealthSection(ctx(only("users")))).toBeNull();
    expect(healthMock).not.toHaveBeenCalled();
  });
});

describe("Recent platform activity", () => {
  it("is one feed, filterable by area, with relative times", async () => {
    await show(RecentSection(ctx()));
    const panel = sectionNamed(/^recent platform activity$/i);
    expect(panel.querySelectorAll("[data-recent-kind]")).toHaveLength(4);
    expect(within(panel).getByText("2 hours ago")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Finance" }));
    expect(within(panel).getByText("Invoice INV-0042 paid")).toBeInTheDocument();
    expect(panel.querySelectorAll("[data-recent-kind]")).toHaveLength(1);
    fireEvent.click(within(panel).getByRole("button", { name: "System" }));
    const change = within(panel).getByText("Omar updated platform settings").closest("a");
    expect(change?.getAttribute("href")).toBe("/en/admin/audit-logs?action=settings.update");
  });

  it("queries and offers only the areas the admin may read", async () => {
    recentMock.mockResolvedValue(recent.filter((event) => event.category === "jobs"));
    await show(RecentSection(ctx(only("jobs"))));
    expect(Array.from(recentMock.mock.calls[0][0] as Set<string>)).toEqual(["jobs"]);
    const filters = Array.from(document.querySelectorAll("[data-recent-filter]")).map((el) => el.getAttribute("data-recent-filter"));
    expect(filters).toEqual(["all", "jobs"]);
    // The full timeline needs audit-log access.
    expect(screen.queryByRole("link", { name: /view all activity/i })).not.toBeInTheDocument();
  });
});

describe("AdminDashboardPage", () => {
  /** The section elements the page streams, with the context each receives. */
  function sectionContexts(node: ReactNode, found: SectionContext[] = []): SectionContext[] {
    if (Array.isArray(node)) node.forEach((child) => sectionContexts(child, found));
    else if (isValidElement<{ children?: ReactNode } & Partial<SectionContext>>(node)) {
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

  it("hands every section the period from the URL, falling back to 30 days", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin", name: "Super Admin" } });
    const contexts = sectionContexts(await page("7d"));
    expect(contexts).toHaveLength(7);
    expect(contexts.every((context) => context.period.key === "7d")).toBe(true);

    expect(sectionContexts(await page("365d"))[0].period.key).toBe("30d");
  });

  it("builds a permission check that honours custom-narrowed admins", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-2", role: "admin", permissionMode: "custom", customPermissions: { jobs: ["read"] } },
    });
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
