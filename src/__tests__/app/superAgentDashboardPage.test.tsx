/**
 * @jest-environment jsdom
 */
/**
 * The super-agent home shell and its header/queue against the real loader
 * with the collections stubbed empty: the page streams every section, the
 * quick actions carry the role's destinations, the greeting falls back when
 * the account has no name, and the one approval only a super-agent can give
 * (exhibition requests) leads the queue with a pre-filtered link.
 */
import { Suspense, isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import SuperAgentDashboard from "@/app/[locale]/(dashboard)/super-agent/page";
import { HeaderSection, QueueSection } from "@/app/[locale]/(dashboard)/super-agent/_components/sections";

const authMock = jest.fn();
const redirectMock = jest.fn();

jest.mock("@/lib/auth/config", () => ({ auth: () => authMock() }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

// A function declaration: jest hoists the mock calls above every `const`,
// so the factory has to be something that is itself hoisted.
function mockEmptyModel() {
  return {
    __esModule: true,
    default: {
      findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }), lean: jest.fn().mockResolvedValue(null) }),
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), lean: jest.fn().mockResolvedValue([]) }),
      countDocuments: jest.fn().mockResolvedValue(0),
      distinct: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue([]),
    },
  };
}
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ timezone: "Asia/Dubai" }) }) }),
  },
}));
jest.mock("@/models/Agent", mockEmptyModel);
jest.mock("@/models/User", mockEmptyModel);
jest.mock("@/models/Employer", mockEmptyModel);
jest.mock("@/models/Job", mockEmptyModel);
jest.mock("@/models/Application", mockEmptyModel);
jest.mock("@/models/Placement", mockEmptyModel);
jest.mock("@/models/Lead", mockEmptyModel);
jest.mock("@/models/Interview", mockEmptyModel);
jest.mock("@/models/Commission", mockEmptyModel);
jest.mock("@/models/ExhibitionRequest", mockEmptyModel);
jest.mock("@/models/TargetProfile", mockEmptyModel);

// The page resolves its data scope through getSuperAgentScope (team ∪ region),
// the same helper every super-agent API uses. The real module pulls in
// next/server, which needs a `Request` global that jsdom does not provide.
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn().mockResolvedValue({
    saProfileId: "sa-1", teamAgentIds: [], regionAgentIds: [], effectiveAgentIds: [], assignedCityIds: [], assignedStateIds: [],
  }),
  getSuperAgentBook: jest.fn().mockResolvedValue({ agentIds: [], employerIds: [], saProfileId: "sa-1", ownershipMatch: { employerId: { $in: [] } } }),
}));

// Region names are resolved from City/State/Country, which pull in bson.
const resolveAssignedRegionsMock = jest.fn();
jest.mock("@/lib/agents/assignedRegion", () => ({
  __esModule: true,
  resolveAssignedRegions: (...args: unknown[]) => resolveAssignedRegionsMock(...args),
}));

/** Every element of a given component type in the tree the page returned, depth first. */
function elementsOf(node: ReactNode, name: string | typeof Suspense, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => elementsOf(child, name, out));
    return out;
  }
  if (!isValidElement(node)) return out;
  const type = node.type as { name?: string; displayName?: string } | string | symbol;
  const matches = typeof name === "string" ? typeof type === "object" || typeof type === "function" ? type.displayName === name || type.name === name : false : type === name;
  if (matches) out.push(node);
  elementsOf((node.props as { children?: ReactNode }).children, name, out);
  return out;
}

const ctx = { userId: "user-1", userName: null, locale: "en", now: new Date("2026-09-24T10:00:00.000Z") };

describe("SuperAgentDashboard", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    resolveAssignedRegionsMock.mockReset();
    resolveAssignedRegionsMock.mockResolvedValue([{ id: "city-1", type: "city", name: "Tirur", parent: "Kerala, India" }]);
    authMock.mockResolvedValue({ user: { id: "user-1", role: "super_agent" } });
  });

  it("redirects to login without a session", async () => {
    authMock.mockResolvedValue(null);
    await SuperAgentDashboard({ params: Promise.resolve({ locale: "en" }) }).catch(() => undefined);
    expect(redirectMock).toHaveBeenCalledWith("/en/login");
  });

  it("streams every section for the signed-in super-agent, with the role's quick actions", async () => {
    const tree = await SuperAgentDashboard({ params: Promise.resolve({ locale: "en" }) });
    const sections = ["HeaderSection", "KpiSection", "QueueSection", "ActivitySection", "FunnelSection", "TeamSplitSection", "CommissionSection", "TopAgentsSection", "ExhibitionsSection"];
    for (const name of sections) {
      const [section] = elementsOf(tree, name);
      expect(section).toBeDefined();
      expect(section.props).toMatchObject({ userId: "user-1", locale: "en" });
    }
    // One instant for the whole page, so every section agrees on "today".
    const nows = new Set(sections.map((name) => (elementsOf(tree, name)[0].props as { now: Date }).now));
    expect(nows.size).toBe(1);
    // Each section streams behind its own boundary.
    expect(elementsOf(tree, Suspense).length).toBeGreaterThanOrEqual(sections.length);

    const [quickActions] = elementsOf(tree, "QuickActions");
    const actions = (quickActions.props as { actions: { key: string; href: string; primary?: boolean }[] }).actions;
    expect(actions.map((a) => a.href)).toEqual([
      "/en/super-agent/agents?new=1",
      "/en/super-agent/territory",
      "/en/super-agent/commissions?status=pending",
      "/en/super-agent/exhibitions?status=pending_review",
    ]);
    expect(actions[0].primary).toBe(true);
  });

  it("hides the quick actions a custom permission set withholds", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "super_agent", permissionMode: "custom", customPermissions: { agents: ["read"], commissions: ["read"], exhibitions: ["read"] } },
    });
    const tree = await SuperAgentDashboard({ params: Promise.resolve({ locale: "en" }) });
    const [quickActions] = elementsOf(tree, "QuickActions");
    expect((quickActions.props as { actions: { key: string }[] }).actions.map((a) => a.key)).toEqual(["assignTerritory"]);
  });

  it("greets a nameless account with the fallback and shows their own assigned region", async () => {
    render(<>{await HeaderSection(ctx)}</>);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/good (morning|afternoon|evening), there/i);
    expect(heading.closest("section")).toHaveClass("workspace-header");
    expect(screen.getByTestId("assigned-region-badge")).toHaveTextContent("Region: Tirur, Kerala, India");
    // Resolved from the SA's own ids on the scope, not the agents' union.
    expect(resolveAssignedRegionsMock).toHaveBeenCalledWith(expect.objectContaining({ assignedCityIds: [], assignedStateIds: [] }), "en");
  });

  it("says so when the super-agent has no region yet", async () => {
    resolveAssignedRegionsMock.mockResolvedValueOnce([]);
    render(<>{await HeaderSection(ctx)}</>);
    expect(screen.getByTestId("assigned-region-badge")).toHaveTextContent("No region assigned");
  });

  it("says nothing is waiting when no queue has work in it", async () => {
    render(<>{await QueueSection(ctx)}</>);
    expect(screen.getByRole("heading", { name: /needs your attention/i })).toBeInTheDocument();
    expect(screen.getAllByText(/nothing is waiting on you right now/i).length).toBeGreaterThan(0);
  });

  it("leads with the pending exhibition queue and links to it pre-filtered", async () => {
    // The one approval only a super-agent can perform. It produced no
    // notification and no dashboard signal, so it was invisible until someone
    // remembered to open it.
    const ExhibitionRequest = (await import("@/models/ExhibitionRequest")).default;
    (ExhibitionRequest.countDocuments as jest.Mock).mockResolvedValueOnce(3);

    render(<>{await QueueSection(ctx)}</>);

    const row = screen.getByRole("link", { name: /exhibition requests await your review/i });
    expect(row).toHaveAttribute("href", "/en/super-agent/exhibitions?status=pending_review");
    expect(row).toHaveTextContent("3");
    expect(row).toHaveAttribute("data-priority-level", "urgent");
  });
});
