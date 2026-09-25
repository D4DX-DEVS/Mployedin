/**
 * @jest-environment jsdom
 */
/**
 * The redesigned super-agent home, rendered from a fixed data set:
 * every KPI states its period, priority pills carry the level in words,
 * the funnel shows ratios that say what they divide (never "jobs 431% of
 * employers"), and top agents link to their own pages.
 */
import { render, screen, within } from "@testing-library/react";
import SuperAgentDashboard from "@/app/[locale]/(dashboard)/super-agent/page";
import type { SuperAgentDashboardData } from "@/lib/superAgent/dashboardData";

jest.mock("@/lib/auth/config", () => ({ auth: async () => ({ user: { id: "sa_user", name: "Super Agent" } }) }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/agents/assignedRegion", () => ({
  __esModule: true,
  resolveAssignedRegions: async () => [{ id: "c1", type: "city", name: "Tirur", parent: "Kerala, India" }],
}));
// recharts measures its container; jsdom has none. The chart's own logic is
// covered by its table view, which renders regardless.
jest.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Pass, BarChart: Pass, Bar: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null };
});

const DATA: SuperAgentDashboardData = {
  timeZone: "Asia/Kolkata",
  kpis: {
    activeAgents: 5, newAgentsThisMonth: 1,
    employers: 26, newEmployersThisMonth: 4,
    activeJobs: 47, jobsPostedThisMonth: 12,
    placementsThisMonth: 0, placementsLastMonth: 0,
  },
  funnel: { leads: 20, employers: 26, jobs: 112, applications: 51, placements: 0 },
  queue: { pendingExhibitions: 15, pendingCommissions: 0, overdueFollowUps: 4, inactiveAgents: 1, idleAgents: 2 },
  topAgents: [
    { agentId: "a1", name: "Agent Rajesh", leads: 66, jobs: 24, applications: 31, placements: 0 },
    { agentId: "a2", name: "Agent Ahmed", leads: 28, jobs: 12, applications: 14, placements: 0 },
  ],
  activity: [
    { month: "2026-04", leads: 60, jobs: 38, applications: 25 },
    { month: "2026-09", leads: 58, jobs: 44, applications: 30 },
  ],
  region: { assignedCityIds: [], assignedStateIds: [] },
};

const loadMock = jest.fn();
jest.mock("@/lib/superAgent/dashboardData", () => ({ loadSuperAgentDashboard: (...a: unknown[]) => loadMock(...a) }));

async function renderPage(data: SuperAgentDashboardData = DATA) {
  loadMock.mockResolvedValue(data);
  return render(await SuperAgentDashboard({ params: Promise.resolve({ locale: "en" }) }));
}

describe("super-agent home layout", () => {
  it("greets the super-agent by name with their region", async () => {
    await renderPage();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/good (morning|afternoon|evening), super/i);
    expect(within(heading.closest("section")!).getByTestId("assigned-region-badge")).toHaveTextContent("Tirur, Kerala, India");
  });

  it("gives every KPI its period and a real this-month movement, and links it to its list", async () => {
    const { container } = await renderPage();
    const card = (key: string) => container.querySelector(`[data-kpi-card="${key}"]`)!;

    expect(card("agents")).toHaveTextContent("5Active AgentsActive on your team now1 new this month");
    expect(card("employers")).toHaveTextContent("4 new this month");
    expect(card("jobs")).toHaveTextContent("Open right now");
    expect(card("jobs")).toHaveTextContent("12 posted this month");
    expect(card("placements")).toHaveTextContent("Completed this month");
    expect(card("placements")).toHaveTextContent("Same as last month");
    // Each card opens its list filtered to what it counted.
    expect(card("jobs")).toHaveAttribute("href", "/en/super-agent/jobs?status=active");
    expect(card("agents")).toHaveAttribute("href", "/en/super-agent/agents?status=active");
  });

  it("never links the same destination twice, and has no shortcut tiles that repeat the navigation", async () => {
    const { container } = await renderPage();
    const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((h, i) => hrefs.indexOf(h) !== i)).toEqual([]);
    expect(screen.queryByRole("heading", { name: /quick actions/i })).toBeNull();
    // The full ranking sits behind Top agents' "view all", not the roster again.
    expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/en/super-agent/agents?sortBy=placements&sortOrder=desc");
  });

  it("lists the queue with a count, a worded level pill and the destination", async () => {
    await renderPage();
    const row = screen.getByRole("link", { name: /exhibition requests await your review/i });
    // Submitted AND under review — both still wait on the super-agent.
    expect(row).toHaveAttribute("href", "/en/super-agent/exhibitions?status=pending_review");
    expect(row).toHaveAttribute("data-priority-level", "urgent");
    expect(row).toHaveTextContent("15");
    expect(within(row).getByText("Blocking")).toBeInTheDocument();
    expect(within(row).getAllByText("Review requests").length).toBeGreaterThan(0);

    const overdue = screen.getByRole("link", { name: /lead follow-ups are overdue/i });
    expect(within(overdue).getByText("Due")).toBeInTheDocument();

    // The roster opens on exactly the deactivated accounts it counted.
    expect(screen.getByRole("link", { name: /agent account is deactivated/i })).toHaveAttribute("href", "/en/super-agent/agents?status=inactive");
  });

  it("shows the funnel as all-time volume with honest ratios, not cross-type percentages", async () => {
    await renderPage();
    const funnel = screen.getByRole("heading", { name: "Regional funnel" }).closest("section")!;
    expect(funnel).toHaveTextContent("All time");
    expect(funnel).toHaveTextContent("Jobs per employer4.3×112 jobs / 26 employers");
    expect(funnel).toHaveTextContent("Applications per job0.46");
    expect(funnel).toHaveTextContent("Placement rate0%0 placements / 51 applications");
    // The old step-over-step column called jobs "431%" of employers.
    expect(funnel).not.toHaveTextContent("431%");
  });

  it("says a ratio is unavailable rather than dividing by zero", async () => {
    await renderPage({ ...DATA, funnel: { leads: 0, employers: 0, jobs: 0, applications: 0, placements: 0 } });
    const funnel = screen.getByRole("heading", { name: "Regional funnel" }).closest("section")!;
    expect(within(funnel).getAllByText("—")).toHaveLength(3);
  });

  it("ranks top agents with their four figures and links each to their page", async () => {
    await renderPage();
    const link = screen.getByRole("link", { name: /agent rajesh/i });
    expect(link).toHaveAttribute("href", "/en/super-agent/agents/a1");
    expect(link).toHaveTextContent("66 Leads · 24 Jobs · 31 Applications · 0 Placements");
  });

  it("charts team activity with a table view of the same figures", async () => {
    await renderPage();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Jobs posted" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "Sep" })).toBeInTheDocument();
  });

  it("shows an empty state instead of a blank grid when the team has no activity", async () => {
    await renderPage({ ...DATA, activity: DATA.activity.map((m) => ({ ...m, leads: 0, jobs: 0, applications: 0 })) });
    expect(screen.getByText("No team activity in the last 6 months")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
