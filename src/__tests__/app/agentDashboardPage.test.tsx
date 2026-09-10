/**
 * @jest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";

import AgentDashboard from "@/app/[locale]/(dashboard)/agent/page";

const authMock = jest.fn();
const redirectMock = jest.fn();
const connectDBMock = jest.fn();
const agentFindOneMock = jest.fn();
const jobFindMock = jest.fn();
const jobCountDocumentsMock = jest.fn();
const applicationAggregateMock = jest.fn();

jest.mock("@/lib/auth/config", () => ({
  auth: () => authMock(),
}));

jest.mock("next/navigation", () => ({
  redirect: (href: string) => redirectMock(href),
}));

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: () => connectDBMock(),
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => agentFindOneMock(...args),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => jobFindMock(...args),
    countDocuments: (...args: unknown[]) => jobCountDocumentsMock(...args),
  },
}));

// The dashboard reads its queue through the shared work-queue module. Mocked
// here so this stays a render test: importing it for real pulls in mongoose
// models, and jest cannot transform bson's ESM build.
const resolveAgentScopeMock = jest.fn();
const getAgentQueueItemsMock = jest.fn();
const getAgentActionCountsMock = jest.fn();

jest.mock("@/lib/agents/workQueue", () => ({
  __esModule: true,
  resolveAgentScope: (...args: unknown[]) => resolveAgentScopeMock(...args),
  getAgentQueueItems: (...args: unknown[]) => getAgentQueueItemsMock(...args),
  getAgentActionCounts: (...args: unknown[]) => getAgentActionCountsMock(...args),
  EMPTY_AGENT_COUNTS: {
    overdueTasks: 0,
    dueFollowUps: 0,
    interviewsAwaitingOutcome: 0,
    offersAwaitingResponse: 0,
    newCandidates: 0,
  },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    aggregate: (...args: unknown[]) => applicationAggregateMock(...args),
  },
}));

// The funnel counts leads and placements live instead of reading the
// fire-and-forget `performance.*` counters on the Agent document.
const leadCountDocumentsMock = jest.fn();
const placementCountDocumentsMock = jest.fn();

jest.mock("@/models/Lead", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => leadCountDocumentsMock(...args),
  },
}));

jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => placementCountDocumentsMock(...args),
  },
}));

describe("AgentDashboard", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    connectDBMock.mockReset();
    agentFindOneMock.mockReset();
    jobFindMock.mockReset();
    jobCountDocumentsMock.mockReset();
    applicationAggregateMock.mockReset();
    resolveAgentScopeMock.mockReset();
    getAgentQueueItemsMock.mockReset();
    getAgentActionCountsMock.mockReset();

    resolveAgentScopeMock.mockResolvedValue({
      agentId: "agent-1",
      assignedEmployerIds: ["employer-1", "employer-2"],
      portfolioJobIds: ["job-1"],
      userId: "user-1",
    });
    getAgentQueueItemsMock.mockResolvedValue([
      { kind: "followUp", id: "lead-1", subject: "Acme Trading", daysLate: 3, href: "/agent/leads?followUp=due" },
      { kind: "task", id: "task-1", subject: "Call the Gulf Metals HR lead", daysLate: 1, href: "/agent/tasks?due=overdue" },
    ]);
    getAgentActionCountsMock.mockResolvedValue({
      overdueTasks: 1,
      dueFollowUps: 1,
      interviewsAwaitingOutcome: 2,
      offersAwaitingResponse: 0,
      newCandidates: 5,
    });

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    connectDBMock.mockResolvedValue(undefined);
    // First call counts active jobs, second counts every vacancy posted.
    jobCountDocumentsMock.mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    // First call counts every lead, second the converted ones.
    leadCountDocumentsMock.mockReset();
    leadCountDocumentsMock.mockResolvedValueOnce(6).mockResolvedValueOnce(3);
    placementCountDocumentsMock.mockReset();
    placementCountDocumentsMock.mockResolvedValue(1);

    agentFindOneMock.mockReturnValue({
      select: () => ({
        lean: async () => ({
          _id: "agent-1",
          assignedEmployerIds: ["employer-1", "employer-2"],
          // Stale counters that must be ignored: the page counts live.
          performance: {
            leadsGenerated: 99,
            employersCreated: 99,
            vacanciesPosted: 99,
            placementsCompleted: 0,
          },
        }),
      }),
    });

    jobFindMock.mockReturnValue({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => ([
              { _id: "job-1", title: "Senior Recruiter", status: "active" },
            ]),
          }),
        }),
      }),
    });

    applicationAggregateMock.mockResolvedValue([
      { _id: { jobId: "job-1", status: "interview_scheduled" }, count: 1 },
      { _id: { jobId: "job-1", status: "offer" }, count: 1 },
    ]);
  });

  it("renders the employer-shaped home: header, queue, signals, pipeline, roles — every number a link", async () => {
    const view = render(
      await AgentDashboard({ params: Promise.resolve({ locale: "en" }) })
    );

    expect(connectDBMock).toHaveBeenCalledTimes(1);

    // Header: same WorkspaceHeader as the employer home, greeting + one
    // context line naming the most urgent queue item, not the queue total.
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/welcome back/i);
    expect(heading.closest("section")).toHaveClass("workspace-header");
    expect(screen.getByText("1 lead follow-up is due.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /post a job/i })).toHaveAttribute("href", "/en/agent/jobs/new");
    // `?new=1` opens the one New Lead dialog on the pipeline page. The old
    // /agent/leads/new route was a second, smaller form and now just redirects.
    expect(screen.getByRole("link", { name: /add a lead/i })).toHaveAttribute("href", "/en/agent/leads?new=1");
    // The old portfolio summary card, funnel tile grid and quick-action tiles are gone.
    expect(screen.queryByText(/active accounts in your current book/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /track which parts of the desk need attention/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /jump into the work most agents do every day/i })).toBeNull();

    // Queue: "Needs your attention" with the total beneath, a View tasks
    // action, and the five counts and rows as links.
    expect(screen.getByRole("heading", { name: /needs your attention/i })).toBeInTheDocument();
    expect(screen.getByText(/9 things need you today/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view tasks/i })).toHaveAttribute("href", "/en/agent/tasks");
    expect(screen.getByRole("link", { name: /1\s*Follow-ups due/i })).toHaveAttribute("href", "/en/agent/leads?followUp=due");
    // Four rows at most, so the page holds one screen.
    expect(getAgentQueueItemsMock).toHaveBeenCalledWith(expect.anything(), 4);
    expect(screen.getByRole("link", { name: /Acme Trading/ })).toHaveAttribute("href", "/en/agent/leads?followUp=due");
    expect(screen.getByText(/3 days late/i)).toBeInTheDocument();

    // At-a-glance figures ride the header's metric strip (no section of their
    // own): book size, live roles and the two rates — nothing the queue or the
    // pipeline already prints. Each is a link.
    expect(screen.queryByRole("heading", { name: /at a glance/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Active Accounts: 2" }).closest("section")).toHaveClass("workspace-header");
    expect(screen.getByRole("link", { name: "Active Accounts: 2" })).toHaveAttribute("href", "/en/agent/employers");
    expect(screen.getByRole("link", { name: "Live Roles: 1" })).toHaveAttribute("href", "/en/agent/jobs?status=active");
    expect(screen.getByRole("link", { name: "Interview Rate: 100%" })).toHaveAttribute("href", "/en/agent/interviews");
    expect(screen.getByRole("link", { name: "Offer Rate: 50%" })).toHaveAttribute("href", "/en/agent/offers");

    // Pipeline: five linked stages on the employer's InteractivePipeline layout,
    // with live lead/placement counts rather than the Agent document's counters.
    const pipeline = screen.getByRole("navigation", { name: /placement pipeline/i });
    const stages = within(pipeline).getAllByRole("link");
    expect(stages.map((a) => a.getAttribute("href"))).toEqual([
      "/en/agent/leads",
      "/en/agent/candidates",
      "/en/agent/interviews",
      "/en/agent/offers",
      "/en/agent/placements",
    ]);
    expect(stages[0]).toHaveAccessibleName("Leads: 6. 3 won");
    expect(stages[1]).toHaveAccessibleName("Applied: 2. Across your roles");
    expect(stages[2]).toHaveAccessibleName("Interviews: 2. 100% of applicants");
    expect(stages[3]).toHaveAccessibleName("Offers: 1. 50% of applicants");
    expect(stages[4]).toHaveAccessibleName("Hired: 1. Placed");
    expect(leadCountDocumentsMock).toHaveBeenNthCalledWith(1, { agentId: "agent-1" });
    expect(leadCountDocumentsMock).toHaveBeenNthCalledWith(2, { agentId: "agent-1", status: "converted" });
    expect(placementCountDocumentsMock).toHaveBeenCalledWith({
      $or: [{ agentId: "agent-1" }, { employerId: { $in: ["employer-1", "employer-2"] } }],
    });

    // Role performance: the whole row is the link, not just the title.
    const roleRow = screen.getByRole("link", { name: /Senior Recruiter/ });
    expect(roleRow).toHaveAttribute("href", "/en/agent/jobs/job-1");
    expect(roleRow).toHaveTextContent("Applications2");

    // Nothing on the page repeats: each figure's label appears once.
    for (const label of ["Active Accounts", "Live Roles", "Interview Rate", "Offer Rate", "Follow-ups due"]) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }

    // Theme-aware surfaces only — no light-only tints as standing backgrounds
    // (hover: variants are the shared employer pattern and are allowed).
    expect(view.container.innerHTML).not.toContain("bg-white/80");
    expect(view.container.innerHTML).not.toContain("bg-white/95");
    expect(view.container.innerHTML).not.toContain("text-slate-950");
    expect(view.container.innerHTML).not.toMatch(/(^|[\s"])bg-(amber|sky|indigo|emerald|violet|rose)-50(?=[\s"])/);
  });
});
