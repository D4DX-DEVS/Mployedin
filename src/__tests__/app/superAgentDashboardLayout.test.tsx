/**
 * @jest-environment jsdom
 */
/**
 * The super-agent home's sections, rendered from a fixed data set: every KPI
 * links to the list it counts and says how it moved, the queue carries a
 * worded level, the funnel shows ratios that say what they divide (never
 * "jobs 431% of employers"), and the roster split is a true partition.
 */
import type { ReactElement, ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import {
  ActivitySection,
  CommissionSection,
  ExhibitionsSection,
  FunnelSection,
  HeaderSection,
  KpiSection,
  QueueSection,
  TeamSplitSection,
  TopAgentsSection,
  type SectionContext,
} from "@/app/[locale]/(dashboard)/super-agent/_components/sections";
import type {
  ActivityMonth,
  DailyActivity,
  SuperAgentCommissions,
  SuperAgentDashboardContext,
  SuperAgentExhibitions,
  SuperAgentFunnel,
  SuperAgentKpis,
  SuperAgentQueueCounts,
  SuperAgentTargets,
  SuperAgentTeamSplit,
  TopAgentRow,
} from "@/lib/superAgent/dashboardData";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/agents/assignedRegion", () => ({
  __esModule: true,
  resolveAssignedRegions: async () => [{ id: "c1", type: "city", name: "Tirur", parent: "Kerala, India" }],
}));
jest.mock("@/lib/currency", () => ({ formatCurrency: (amount: number, currency: string) => `${currency} ${amount}` }));
// recharts measures its container; jsdom has none. Charts render as inert boxes
// and the assertions go through the legends and lists beside them.
jest.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <svg data-chart>{children}</svg>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Box, AreaChart: Box, PieChart: Box, Area: Nothing, Pie: Nothing, Cell: Nothing,
    CartesianGrid: Nothing, XAxis: Nothing, YAxis: Nothing, Tooltip: Nothing,
  };
});

const contextMock = jest.fn();
const kpisMock = jest.fn();
const queueMock = jest.fn();
const funnelMock = jest.fn();
const topAgentsMock = jest.fn();
const financeMock = jest.fn();
jest.mock("@/lib/superAgent/dashboardData", () => ({
  loadSuperAgentContext: (...a: unknown[]) => contextMock(...a),
  loadSuperAgentKpis: (...a: unknown[]) => kpisMock(...a),
  loadSuperAgentQueue: (...a: unknown[]) => queueMock(...a),
  loadSuperAgentFunnel: (...a: unknown[]) => funnelMock(...a),
  loadSuperAgentTopAgents: (...a: unknown[]) => topAgentsMock(...a),
  loadSuperAgentFinance: (...a: unknown[]) => financeMock(...a),
}));

const NOW = new Date("2026-09-24T10:00:00.000Z");

const CTX = {
  now: NOW,
  timeZone: "Asia/Kolkata",
  region: { assignedCityIds: [], assignedStateIds: [] },
} as unknown as SuperAgentDashboardContext;

const KPIS: SuperAgentKpis = {
  activeAgents: 5, newAgentsThisMonth: 1, newAgentsLastMonth: 0,
  employers: 26, newEmployersThisMonth: 4, newEmployersLastMonth: 4,
  activeJobs: 47, jobsPostedThisMonth: 12, jobsPostedLastMonth: 8,
  placementsThisMonth: 2, placementsLastMonth: 1,
  placementsLast30Days: 3, placementsPrevious30Days: 4,
};
const DAILY: DailyActivity[] = Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, agents: 0, employers: i % 7 === 0 ? 1 : 0, jobs: i % 3, placements: 0 }));
const FUNNEL: SuperAgentFunnel = { leads: 20, employers: 26, jobs: 112, applications: 51, placements: 0 };
const ACTIVITY: ActivityMonth[] = [
  { month: "2026-04", leads: 60, jobs: 38, applications: 25 },
  { month: "2026-09", leads: 58, jobs: 44, applications: 30 },
];
const QUEUE: SuperAgentQueueCounts = { pendingExhibitions: 15, pendingCommissions: 0, overdueFollowUps: 4, inactiveAgents: 1, idleAgents: 2 };
const TEAM: SuperAgentTeamSplit = { total: 5, engaged: 3, idle: 1, inactive: 1 };
const TOP: TopAgentRow[] = [
  { agentId: "a1", name: "Agent Rajesh", leads: 66, jobs: 24, applications: 31, placements: 0 },
  { agentId: "a2", name: "Agent Ahmed", leads: 28, jobs: 12, applications: 14, placements: 0 },
];
const COMMISSIONS: SuperAgentCommissions = {
  currency: "AED",
  pending: { count: 3, amount: 1200 },
  approved: { count: 1, amount: 400 },
  disputed: { count: 0, amount: 0 },
  paidThisMonth: { count: 2, amount: 900 },
  paidLastMonth: { count: 1, amount: 600 },
  daily: DAILY.map((d) => ({ day: d.day, pending: 0, paid: 0 })),
};
const EXHIBITIONS: SuperAgentExhibitions = { awaitingReview: 15, revisionRequested: 1, approved: 2, active: 1 };
const TARGETS: SuperAgentTargets = { year: 2026, agentsWithTarget: 2, agentsTotal: 5 };

const ctx = (): SectionContext => ({ userId: "sa_user", userName: "Super Agent", locale: "en", now: NOW });

async function show(section: Promise<ReactElement | null>) {
  return render(<>{await section}</>);
}

beforeEach(() => {
  jest.clearAllMocks();
  contextMock.mockResolvedValue(CTX);
  kpisMock.mockResolvedValue({ kpis: KPIS, daily: DAILY });
  queueMock.mockResolvedValue({ queue: QUEUE, team: TEAM });
  funnelMock.mockResolvedValue({ funnel: FUNNEL, activity: ACTIVITY });
  topAgentsMock.mockResolvedValue(TOP);
  financeMock.mockResolvedValue({ commissions: COMMISSIONS, exhibitions: EXHIBITIONS, targets: TARGETS });
});

describe("super-agent home sections", () => {
  it("greets the super-agent by name with their region, in their own time zone", async () => {
    await show(HeaderSection(ctx()));
    const heading = screen.getByRole("heading", { level: 1 });
    // 10:00Z is 15:30 in Kolkata: afternoon.
    expect(heading).toHaveTextContent("Good afternoon, Super");
    expect(within(heading.closest("section")!).getByTestId("assigned-region-badge")).toHaveTextContent("Tirur, Kerala, India");
    expect(contextMock).toHaveBeenCalledWith("sa_user", NOW);
  });

  it("shows six headline numbers, each linking to its list with its movement against the previous period", async () => {
    const { container } = await show(KpiSection(ctx()));
    const tiles = [...container.querySelectorAll("[data-kpi-strip] > a")];
    expect(tiles.map((a) => a.getAttribute("href"))).toEqual([
      "/en/super-agent/agents?status=active",
      "/en/super-agent/employers",
      "/en/super-agent/jobs?status=active",
      "/en/super-agent/placements",
      "/en/super-agent/commissions?status=pending",
      "/en/super-agent/commissions?status=paid",
    ]);
    // 1 new agent against none last month: the count, since there is no base for a percentage.
    expect(tiles[0]).toHaveTextContent("Active Agents5");
    expect(tiles[0]).toHaveTextContent("+1");
    // 4 vs 4 employers: flat.
    expect(tiles[1]).toHaveTextContent("0%");
    // 12 vs 8 jobs posted.
    expect(tiles[2]).toHaveTextContent("47");
    expect(tiles[2]).toHaveTextContent("12 posted this month");
    expect(tiles[2]).toHaveTextContent("+50%");
    // 3 vs 4 placements in the last 30 days.
    expect(tiles[3]).toHaveTextContent("3");
    expect(tiles[3]).toHaveTextContent("−25%");
    // Money is formatted with the busiest currency.
    expect(tiles[4]).toHaveTextContent("AED 1200");
    expect(tiles[5]).toHaveTextContent("AED 900");
    expect(tiles[5]).toHaveTextContent("+50%");
    // Sparklines are drawn from the daily series.
    expect(container.querySelectorAll("[data-chart]").length).toBeGreaterThan(0);
  });

  it("lists the queue with a count, a worded level and the pre-filtered destination, most blocking first", async () => {
    await show(QueueSection(ctx()));
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/en/super-agent/exhibitions?status=pending_review",
      "/en/super-agent/leads?hasFollowUp=overdue",
      "/en/super-agent/agents?status=inactive",
      "/en/super-agent/agents?performance=no_activity",
    ]);
    const row = screen.getByRole("link", { name: /exhibition requests await your review/i });
    expect(row).toHaveAttribute("data-priority-level", "urgent");
    expect(row).toHaveTextContent("15");
    expect(within(row).getByText("Blocking")).toBeInTheDocument();
    expect(within(row).getByText(/review requests/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /lead follow-ups are overdue/i })).toHaveAttribute("data-priority-level", "soon");
    expect(screen.getByRole("link", { name: /agent account is deactivated/i })).toHaveAttribute("data-priority-level", "review");
  });

  it("says nothing is waiting when every queue is clear", async () => {
    queueMock.mockResolvedValue({ queue: { pendingExhibitions: 0, pendingCommissions: 0, overdueFollowUps: 0, inactiveAgents: 0, idleAgents: 0 }, team: TEAM });
    await show(QueueSection(ctx()));
    expect(screen.getByRole("heading", { name: /needs your attention/i })).toBeInTheDocument();
    expect(screen.getAllByText(/nothing is waiting on you right now/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("charts six months of team activity as three named series", async () => {
    await show(ActivitySection(ctx()));
    const panel = screen.getByRole("heading", { name: "Team activity" }).closest("section")!;
    for (const label of ["Leads", "Jobs posted", "Applications"]) expect(within(panel).getByText(label)).toBeInTheDocument();
    expect(panel.querySelector("[data-chart]")).not.toBeNull();
    expect(within(panel).getByRole("link", { name: /reports/i })).toHaveAttribute("href", "/en/super-agent/reports");
  });

  it("shows an empty state instead of a blank chart when the team has no activity", async () => {
    funnelMock.mockResolvedValue({ funnel: FUNNEL, activity: ACTIVITY.map((m) => ({ ...m, leads: 0, jobs: 0, applications: 0 })) });
    await show(ActivitySection(ctx()));
    expect(screen.getByText("No team activity in the last 6 months")).toBeInTheDocument();
    expect(document.querySelector("[data-chart]")).toBeNull();
  });

  it("shows the funnel as all-time volume with honest ratios, each stage opening its list", async () => {
    await show(FunnelSection(ctx()));
    const funnel = screen.getByRole("heading", { name: "Regional funnel" }).closest("section")!;
    expect(funnel).toHaveTextContent("All time");
    expect(within(funnel).getByRole("link", { name: /leads/i })).toHaveAttribute("href", "/en/super-agent/leads");
    expect(within(funnel).getByRole("link", { name: /placements/i })).toHaveAttribute("href", "/en/super-agent/placements");
    expect(funnel).toHaveTextContent("Jobs per employer4.3×112 jobs / 26 employers");
    expect(funnel).toHaveTextContent("Applications per job0.46");
    expect(funnel).toHaveTextContent("Placement rate0%0 placements / 51 applications");
    // The old step-over-step column called jobs "431%" of employers.
    expect(funnel).not.toHaveTextContent("431%");
  });

  it("says a ratio is unavailable rather than dividing by zero", async () => {
    funnelMock.mockResolvedValue({ funnel: { leads: 0, employers: 0, jobs: 0, applications: 0, placements: 0 }, activity: ACTIVITY });
    await show(FunnelSection(ctx()));
    const funnel = screen.getByRole("heading", { name: "Regional funnel" }).closest("section")!;
    expect(within(funnel).getAllByText("—")).toHaveLength(3);
  });

  it("splits the roster into working, idle and deactivated agents, each opening the roster filtered to it", async () => {
    await show(TeamSplitSection(ctx()));
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual(expect.arrayContaining([
      "/en/super-agent/agents?status=active",
      "/en/super-agent/agents?performance=no_activity",
      "/en/super-agent/agents?status=inactive",
      "/en/super-agent/agents",
    ]));
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getAllByText("20%")).toHaveLength(2);
  });

  it("summarises commissions by stage in one currency with a link per stage", async () => {
    await show(CommissionSection(ctx()));
    const panel = document.getElementById("super-agent-commissions")!;
    const links = within(panel).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/en/super-agent/commissions",
      "/en/super-agent/commissions?status=pending",
      "/en/super-agent/commissions?status=approved",
      "/en/super-agent/commissions?status=paid",
      "/en/super-agent/commissions?status=disputed",
    ]);
    expect(links[1]).toHaveTextContent("AED 1200");
    expect(links[3]).toHaveTextContent("AED 900");
    expect(links[4]).toHaveTextContent("AED 0");
  });

  it("ranks top agents with their four figures and links each to their page", async () => {
    await show(TopAgentsSection(ctx()));
    const link = screen.getByRole("link", { name: /agent rajesh/i });
    expect(link).toHaveAttribute("href", "/en/super-agent/agents/a1");
    const row = link.closest("tr")!;
    expect(row).toHaveTextContent("Agent Rajesh6624310");
    // The full ranking sits behind "view all", not the roster again.
    expect(screen.getByRole("link", { name: /view all agents/i })).toHaveAttribute("href", "/en/super-agent/agents?sortBy=placements&sortOrder=desc");
  });

  it("lists exhibition requests by stage and target coverage, each opening its list", async () => {
    await show(ExhibitionsSection(ctx()));
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/en/super-agent/exhibitions",
      "/en/super-agent/exhibitions?status=pending_review",
      "/en/super-agent/exhibitions?status=revision_requested",
      "/en/super-agent/exhibitions?status=approved",
      "/en/super-agent/exhibitions?status=active",
      "/en/super-agent/target-management",
    ]);
    expect(screen.getByRole("link", { name: /pending_review|awaiting/i })).toHaveTextContent("15");
  });

  it("renders a failed section on its own without taking the others down", async () => {
    financeMock.mockRejectedValue(new Error("mongo down"));
    await show(CommissionSection(ctx()));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(document.getElementById("super-agent-commissions")).not.toBeNull();
  });
});
