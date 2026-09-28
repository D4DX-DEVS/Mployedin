/**
 * @jest-environment jsdom
 */
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";

import AgentDashboard from "@/app/[locale]/(dashboard)/agent/page";
import {
  KpiSection,
  LeadFunnelSection,
  QueueSection,
  RecruitmentSection,
  TargetSection,
  TrendSection,
  type AgentSectionContext,
} from "@/app/[locale]/(dashboard)/agent/_components/sections";

const authMock = jest.fn();
const redirectMock = jest.fn();
const connectDBMock = jest.fn();
const agentFindOneMock = jest.fn();
const jobFindMock = jest.fn();
const jobCountDocumentsMock = jest.fn();
const applicationAggregateMock = jest.fn();
const leadCountDocumentsMock = jest.fn();
const placementCountDocumentsMock = jest.fn();
const targetFindOneMock = jest.fn();
const commissionAggregateMock = jest.fn();
const monthlyAchievementsMock = jest.fn();
const resolveAgentScopeMock = jest.fn();
const getAgentQueueItemsMock = jest.fn();
const getAgentActionCountsMock = jest.fn();
const resolveAssignedRegionsMock = jest.fn();
const activityTrendMock = jest.fn();
const leadFunnelMock = jest.fn();
const commissionByStatusMock = jest.fn();

jest.mock("@/lib/auth/config", () => ({ auth: () => authMock() }));
jest.mock("next/navigation", () => ({
  redirect: (href: string) => redirectMock(href),
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: () => connectDBMock() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

// Recharts measures its container; jsdom has no layout, so the charts render as inert boxes.
jest.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <svg data-chart>{children}</svg>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box, AreaChart: Box, PieChart: Box, Area: Nothing, Pie: Nothing, Cell: Nothing,
    CartesianGrid: Nothing, XAxis: Nothing, YAxis: Nothing, Tooltip: Nothing, Legend: Nothing,
  };
});

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => agentFindOneMock(...args) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => jobFindMock(...args),
    countDocuments: (...args: unknown[]) => jobCountDocumentsMock(...args),
  },
}));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { aggregate: (...args: unknown[]) => applicationAggregateMock(...args) },
}));
jest.mock("@/models/Lead", () => ({
  __esModule: true,
  default: { countDocuments: (...args: unknown[]) => leadCountDocumentsMock(...args) },
}));
jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: { countDocuments: (...args: unknown[]) => placementCountDocumentsMock(...args) },
}));
jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => targetFindOneMock(...args) },
}));
jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: { aggregate: (...args: unknown[]) => commissionAggregateMock(...args) },
}));
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({
  calculateMonthlyAchievements: (...args: unknown[]) => monthlyAchievementsMock(...args),
}));

// The queue and the scope come through the shared work-queue module. Mocked so
// this stays a render test: importing it for real pulls in mongoose models,
// and jest cannot transform bson's ESM build.
jest.mock("@/lib/agents/workQueue", () => ({
  __esModule: true,
  resolveAgentScope: (...args: unknown[]) => resolveAgentScopeMock(...args),
  getAgentQueueItems: (...args: unknown[]) => getAgentQueueItemsMock(...args),
  getAgentActionCounts: (...args: unknown[]) => getAgentActionCountsMock(...args),
}));
// Daily series and breakdowns: mocked at the same boundary (dashboardShapes,
// the pure helper module, is the real one).
jest.mock("@/lib/agents/dashboardTrends", () => ({
  __esModule: true,
  getAgentActivityTrend: (...args: unknown[]) => activityTrendMock(...args),
  getAgentLeadFunnel: (...args: unknown[]) => leadFunnelMock(...args),
  getAgentCommissionByStatus: (...args: unknown[]) => commissionByStatusMock(...args),
}));
// Region names come from City/State/Country; mocked for the same bson reason.
jest.mock("@/lib/agents/assignedRegion", () => ({
  __esModule: true,
  resolveAssignedRegions: (...args: unknown[]) => resolveAssignedRegionsMock(...args),
}));

const THIS_MONTH = new Date().getMonth() + 1;
const NOW = new Date();

const scope = {
  agentId: "agent-1",
  assignedEmployerIds: ["employer-1", "employer-2"],
  portfolioJobIds: ["job-1"],
  userId: "user-1",
};

const context: AgentSectionContext = {
  locale: "en",
  userId: "user-1",
  scope: scope as unknown as AgentSectionContext["scope"],
  currency: "AED",
  now: NOW,
};

const day = (offset: number) => new Date(NOW.getTime() - offset * 86_400_000).toISOString().slice(0, 10);

async function renderSection(section: Promise<ReactNode>) {
  return render(<>{await section}</>);
}

describe("AgentDashboard", () => {
  // The page nests async section components inside <Suspense>; rendering that
  // tree client-side makes React log that only server components may be async
  // and that the suspended sections resolved outside act(). Sections are
  // exercised directly below, so the page test only needs the shell.
  const EXPECTED_NOISE = ["async Client Component", "suspended inside an `act` scope", "suspended resource finished loading"];
  let consoleError: jest.SpyInstance;
  beforeAll(() => {
    const original = console.error;
    consoleError = jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === "string" && EXPECTED_NOISE.some((noise) => (args[0] as string).includes(noise))) return;
      original(...args);
    });
  });
  afterAll(() => consoleError.mockRestore());

  beforeEach(() => {
    jest.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", name: "Sam Carter" } });
    connectDBMock.mockResolvedValue(undefined);
    agentFindOneMock.mockReturnValue({
      select: () => ({
        lean: async () => ({
          _id: "agent-1",
          assignedEmployerIds: ["employer-1", "employer-2"],
          currencyCode: "AED",
          // Stale counters that must be ignored: the page counts live.
          performance: { leadsGenerated: 99, employersCreated: 99, vacanciesPosted: 99, placementsCompleted: 0 },
        }),
      }),
    });
    resolveAgentScopeMock.mockResolvedValue(scope);
    resolveAssignedRegionsMock.mockResolvedValue([{ id: "city-1", type: "city", name: "Tirur", parent: "Kerala, India" }]);

    // Portfolio: first count is active jobs, second every vacancy posted.
    jobCountDocumentsMock.mockImplementation((filter: { status?: string }) => Promise.resolve(filter.status === "active" ? 1 : 4));
    // Every lead, then the converted ones.
    leadCountDocumentsMock.mockImplementation((filter: { status?: string }) => Promise.resolve(filter.status === "converted" ? 3 : 6));
    placementCountDocumentsMock.mockResolvedValue(1);
    jobFindMock.mockReturnValue({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => [
              { _id: "job-1", title: "Senior Recruiter", status: "active" },
              { _id: "job-2", title: "Site Engineer", status: "active" },
            ],
          }),
        }),
      }),
    });
    applicationAggregateMock.mockResolvedValue([
      { _id: { jobId: "job-1", status: "interview_scheduled" }, count: 1 },
      { _id: { jobId: "job-1", status: "offer" }, count: 1 },
      { _id: { jobId: "job-2", status: "applied" }, count: 2 },
    ]);

    activityTrendMock.mockResolvedValue({
      daily: [
        { day: day(2), leads: 1, jobs: 0, applications: 2, interviews: 0, placements: 0 },
        { day: day(1), leads: 0, jobs: 1, applications: 3, interviews: 1, placements: 0 },
        { day: day(0), leads: 2, jobs: 0, applications: 1, interviews: 1, placements: 1 },
      ],
      current: { leads: 3, jobs: 1, applications: 6, interviews: 2, placements: 1 },
      previous: { leads: 1, jobs: 0, applications: 12, interviews: 2, placements: 0 },
      days: 30,
    });
    leadFunnelMock.mockResolvedValue({ new: 2, contacted: 1, interested: 0, negotiating: 0, converted: 3, lost: 0 });
    commissionByStatusMock.mockResolvedValue({
      pending: { count: 1, amount: 500 },
      approved: { count: 1, amount: 1000 },
      paid: { count: 0, amount: 0 },
      disputed: { count: 0, amount: 0 },
    });

    targetFindOneMock.mockReturnValue({
      select: () => ({
        lean: async () => ({
          currency: "AED",
          monthlyTargets: [{ month: THIS_MONTH, employerTarget: 1, employeeTarget: 6, financeTarget: 6250 }],
        }),
      }),
    });
    commissionAggregateMock.mockResolvedValue([{ total: 1500 }]);
    monthlyAchievementsMock.mockResolvedValue([
      {
        month: THIS_MONTH,
        employerTarget: 1, employeeTarget: 6, financeTarget: 6250,
        employerAchieved: 1, employeeAchieved: 3, financeAchieved: 1500,
        employerProgress: 100, employeeProgress: 50, financeProgress: 24, overallProgress: 42,
      },
    ]);

    getAgentQueueItemsMock.mockResolvedValue([
      { kind: "followUp", id: "lead-1", subject: "Acme Trading", daysLate: 3, href: "/agent/leads?followUp=due" },
      { kind: "task", id: "task-1", subject: "Call the Gulf Metals HR lead", daysLate: 1, href: "/agent/tasks?due=overdue" },
    ]);
    getAgentActionCountsMock.mockResolvedValue({
      overdueTasks: 1, dueFollowUps: 1, interviewsAwaitingOutcome: 2, offersAwaitingResponse: 0, newCandidates: 5,
    });
  });

  it("renders the header, quick actions and one streaming slot per section", async () => {
    render(await AgentDashboard({ params: Promise.resolve({ locale: "en" }) }));

    expect(connectDBMock).toHaveBeenCalled();
    // Greeting by the agent's own clock — no emoji, first name only.
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^good (morning|afternoon|evening), Sam$/i);
    expect(heading.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    // The admin-assigned region, parent chain included.
    expect(screen.getByTestId("assigned-region-badge")).toHaveTextContent("Tirur, Kerala, India");
    expect(resolveAssignedRegionsMock).toHaveBeenCalledWith(expect.objectContaining({ _id: "agent-1" }), "en");
    expect(resolveAgentScopeMock).toHaveBeenCalledWith("user-1");

    // Quick actions: the four things an agent creates, "Add lead" leading.
    // (New copy lives in the role's i18n file until the orchestrator merges it,
    // so this file asserts structure and hrefs rather than new strings.)
    const actions = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(actions.map((a) => a.getAttribute("href"))).toEqual([
      "/en/agent/leads?new=1",
      "/en/agent/jobs/new",
      "/en/agent/job-seekers",
      "/en/agent/tasks?new=1",
    ]);
    expect(actions[0]).toHaveClass("bg-primary");

    // Sections stream in behind skeletons; the page itself renders none of the data.
    expect(document.querySelectorAll("[aria-busy='true']").length).toBeGreaterThanOrEqual(6);
    // The old tabbed/flat layout is gone.
    expect(screen.queryByText(/active accounts in your current book/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /jump into the work most agents do every day/i })).toBeNull();
  });

  it("KPI strip: six linked tiles with 30-day deltas, counted from the portfolio", async () => {
    await renderSection(KpiSection(context));

    const strip = document.querySelector("[data-kpi-strip]")!;
    const tiles = within(strip as HTMLElement).getAllByRole("link");
    expect(tiles.map((a) => a.getAttribute("href"))).toEqual([
      "/en/agent/employers",
      "/en/agent/jobs?status=active",
      "/en/agent/candidates",
      "/en/agent/interviews",
      "/en/agent/placements",
      expect.stringMatching(/^\/en\/agent\/commissions\?dateFrom=\d{4}-\d{2}-01&dateTo=\d{4}-\d{2}-\d{2}$/),
    ]);
    expect(tiles[0]).toHaveTextContent("Active Accounts");
    expect(tiles[0]).toHaveTextContent("2");
    expect(tiles[1]).toHaveTextContent("Live Roles");
    expect(tiles[1]).toHaveTextContent("1");
    // Candidates sourced: 6 vs 12 → down 50%.
    expect(tiles[2]).toHaveTextContent("6");
    expect(tiles[2]).toHaveTextContent("−50%");
    // Interviews: 2 vs 2 → no pill.
    expect(tiles[3]).toHaveTextContent("2");
    expect(tiles[3]).not.toHaveTextContent("%");
    // Placements: 1 vs 0 → "new", so no pill number either.
    expect(tiles[4]).toHaveTextContent("1");
    expect(tiles[4]).not.toHaveTextContent("+");
    expect(tiles[5]).toHaveTextContent("Commission this month");
    expect(tiles[5]).toHaveTextContent("1,500");

    // Live counts, not the Agent document's counters.
    expect(jobCountDocumentsMock).toHaveBeenCalledWith(expect.objectContaining({ status: "active", deletedAt: null }));
    expect(placementCountDocumentsMock).toHaveBeenCalledWith({
      $or: [{ agentId: "agent-1" }, { employerId: { $in: ["employer-1", "employer-2"] } }],
    });
    // The agent's own lines, the three statuses the commissions page sums.
    const [pipelineArg] = commissionAggregateMock.mock.calls[0] as [{ $match?: Record<string, unknown> }[]];
    expect(pipelineArg[0].$match).toMatchObject({ agentId: "agent-1", status: { $in: ["pending", "approved", "paid"] } });
    expect(activityTrendMock).toHaveBeenCalledWith(scope, NOW);
  });

  it("target: a ring for the month and a bar per metric, from the target report's calculator", async () => {
    await renderSection(TargetSection(context));

    expect(targetFindOneMock).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: "user-1", assigneeRole: "agent", status: "active" }));
    expect(monthlyAchievementsMock).toHaveBeenCalledWith("user-1", "agent", new Date().getFullYear(), [expect.objectContaining({ month: THIS_MONTH })]);
    expect(screen.getByRole("img", { name: "Overall: 42%" })).toBeInTheDocument();
    // One bar per metric with a target, each carrying its own percent.
    const bars = document.querySelectorAll("#agent-target ul li");
    expect(bars).toHaveLength(3);
    expect(bars[0]).toHaveTextContent("100%");
    expect(bars[1]).toHaveTextContent("50%");
    expect(bars[2]).toHaveTextContent("24%");
    expect(document.querySelector('#agent-target a[href="/en/agent/target-report"]')).not.toBeNull();
  });

  it("target: shows a dash, not 0%, when the super-agent has set no target this month", async () => {
    targetFindOneMock.mockReturnValue({ select: () => ({ lean: async () => null }) });
    await renderSection(TargetSection(context));
    expect(screen.getByRole("img", { name: "Overall: —" })).toBeInTheDocument();
    expect(screen.getByText("no target set")).toBeInTheDocument();
    expect(document.querySelectorAll("#agent-target ul li")).toHaveLength(0);
    expect(monthlyAchievementsMock).not.toHaveBeenCalled();
  });

  it("queue: counts as chips and rows as links, most overdue first", async () => {
    await renderSection(QueueSection(context));

    expect(screen.getByRole("heading", { name: /needs your attention/i })).toBeInTheDocument();
    expect(screen.getByText(/9 things need you today/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view tasks/i })).toHaveAttribute("href", "/en/agent/tasks");
    expect(screen.getByRole("link", { name: /1\s*Follow-ups due/i })).toHaveAttribute("href", "/en/agent/leads?followUp=due");
    // Only counts that need action get a chip: offers awaiting reply is 0.
    expect(screen.queryByRole("link", { name: /offers awaiting reply/i })).toBeNull();
    expect(getAgentQueueItemsMock).toHaveBeenCalledWith(scope, 6);
    expect(screen.getByRole("link", { name: /Acme Trading/ })).toHaveAttribute("href", "/en/agent/leads?followUp=due");
    expect(screen.getByText(/3 days late/i)).toBeInTheDocument();
  });

  it("queue: says the desk is clear when nothing is late", async () => {
    getAgentActionCountsMock.mockResolvedValue({ overdueTasks: 0, dueFollowUps: 0, interviewsAwaitingOutcome: 0, offersAwaitingResponse: 0, newCandidates: 0 });
    getAgentQueueItemsMock.mockResolvedValue([]);
    await renderSection(QueueSection(context));
    expect(screen.queryByRole("link", { name: /follow-ups due/i })).toBeNull();
    expect(screen.getByText("Nothing is overdue")).toBeInTheDocument();
    expect(screen.getByText("Your queue is clear")).toBeInTheDocument();
  });

  it("trend: leads, applications and placements on one chart", async () => {
    await renderSection(TrendSection(context));
    const panel = document.getElementById("agent-trend")!;
    expect(within(panel).getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(panel.querySelector("[data-chart]")).not.toBeNull();
    expect(panel.querySelector('a[href="/en/agent/reports"]')).not.toBeNull();
  });

  it("lead funnel: five linked stages new → converted, from live lead counts", async () => {
    await renderSection(LeadFunnelSection(context));
    expect(leadFunnelMock).toHaveBeenCalledWith("agent-1");
    expect(leadCountDocumentsMock).toHaveBeenCalledWith({ agentId: "agent-1" });
    expect(leadCountDocumentsMock).toHaveBeenCalledWith({ agentId: "agent-1", status: "converted" });
    const panel = document.getElementById("agent-lead-funnel")!;
    const stageLinks = Array.from(panel.querySelectorAll("ul a")).map((a) => a.getAttribute("href"));
    expect(stageLinks).toEqual(["new", "contacted", "interested", "negotiating", "converted"].map((s) => `/en/agent/leads?status=${s}`));
    // Converted: 3 of 6 leads.
    expect(panel.querySelector('a[href="/en/agent/leads?status=converted"]')).toHaveTextContent("50%");
    expect(panel.querySelector('a[href="/en/agent/leads?status=lost"]')).toHaveTextContent("0");
    expect(panel.querySelector('a[href="/en/agent/leads"]')).not.toBeNull();
  });

  it("recruitment: pipeline donut, busiest roles and this month's commission by status", async () => {
    await renderSection(RecruitmentSection(context));

    // Donut: one legend row per status with applications, each the filtered candidates list.
    const donut = document.getElementById("agent-pipeline")!;
    expect(donut.querySelector("[data-chart]")).not.toBeNull();
    const statusLinks = Array.from(donut.querySelectorAll("ul a")).map((a) => a.getAttribute("href"));
    expect(statusLinks).toEqual([
      "/en/agent/candidates?status=applied",
      "/en/agent/candidates?status=interview_scheduled",
      "/en/agent/candidates?status=offer",
    ]);
    // Applied: 2 of 4.
    expect(donut.querySelector('a[href="/en/agent/candidates?status=applied"]')).toHaveTextContent("50%");

    // Roles: live roles only, ranked by applications, whole bar a link to the role.
    expect(jobFindMock).toHaveBeenCalledWith(expect.objectContaining({ status: "active", deletedAt: null }));
    const roles = within(document.getElementById("agent-role-performance")!).getAllByRole("link");
    expect(roles.map((a) => a.getAttribute("href"))).toEqual(["/en/agent/jobs", "/en/agent/jobs/job-1", "/en/agent/jobs/job-2"]);
    expect(roles[1]).toHaveTextContent("Senior Recruiter");
    expect(roles[2]).toHaveTextContent("Site Engineer");

    // Commission by status, each row the commissions page filtered to it and this month.
    const [, from, to] = commissionByStatusMock.mock.calls[0] as [unknown, Date, Date];
    expect(from.getDate()).toBe(1);
    expect(to.getMonth()).toBe(NOW.getMonth());
    const money = document.getElementById("agent-commission")!;
    const rows = Array.from(money.querySelectorAll("ul a"));
    expect(rows.map((a) => a.getAttribute("href"))).toEqual(
      ["pending", "approved", "paid", "disputed"].map((s) => expect.stringMatching(new RegExp(`^/en/agent/commissions\\?status=${s}&dateFrom=\\d{4}-\\d{2}-01&dateTo=\\d{4}-\\d{2}-\\d{2}$`))),
    );
    expect(rows[0]).toHaveTextContent("500");
    expect(rows[1]).toHaveTextContent("1,000");
  });

  it("renders every section empty, not broken, for a user with no agent document yet", async () => {
    const bare: AgentSectionContext = { ...context, scope: null };
    await renderSection(KpiSection(bare));
    expect(jobCountDocumentsMock).not.toHaveBeenCalled();
    expect(commissionAggregateMock).not.toHaveBeenCalled();
    expect(document.querySelectorAll("[data-kpi-strip] a")).toHaveLength(6);
    await renderSection(LeadFunnelSection(bare));
    expect(leadFunnelMock).not.toHaveBeenCalled();
    expect(document.querySelector('#agent-lead-funnel a[href="/en/agent/leads?status=new"]')).toBeNull();
  });
});
