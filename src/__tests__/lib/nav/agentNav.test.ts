/**
 * @jest-environment node
 */
/**
 * The agent navigation contract.
 *
 * The agent rail is shaped like the employer rail on purpose: the two roles
 * do the same hiring work from opposite sides of the table, so the stage
 * pages sit under "Hiring" in the same order, the CRM pages under
 * "Accounts", and the outreach material under "Marketing". Two rules keep it
 * honest — every nav href must resolve to a real route, and every agent route
 * must be reachable from the sidebar, a bottom tab, or an entry on the list
 * below that says who reaches it.
 */
import fs from "fs";
import path from "path";
import { getNavGroups, type NavItem } from "@/lib/nav/menuConfig";
import { WORKSPACE_BOTTOM_NAV_TABS } from "@/lib/nav/bottomNavTabs";

const AGENT_ROOT = path.join(process.cwd(), "src", "app", "[locale]", "(dashboard)", "agent");

/**
 * Routes deliberately absent from the sidebar, each with the surface that
 * does reach them. Adding one without a reason is how orphans happen.
 */
const REACHED_ELSEWHERE: Record<string, string> = {
  "/agent/jobs/new": "Create menu + ⌘K action + jobs list header",
  "/agent/leads/new": "Redirects to the one New Lead dialog (/agent/leads?new=1)",
  "/agent/messages": "Topbar messages indicator, shown at every width once the rail has no Messages row",
  "/agent/chat": "Channels tab on the messages page (AgentSectionTabs)",
  "/agent/target-management": "Targets tab on Performance (AgentSectionTabs)",
  "/agent/target-report": "Target report tab on Performance (AgentSectionTabs)",
  "/agent/commissions-report": "Commission report tab on Performance (AgentSectionTabs)",
  "/agent/targets": "Legacy redirect to target-management",
  "/agent/settings": "User profile dropdown in the topbar",
};

function collectRoutes(dir: string, prefix = "/agent"): string[] {
  const routes: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // A detail route is reached from its own list, never from the sidebar.
    if (entry.name.startsWith("[")) continue;
    const child = path.join(dir, entry.name);
    const childPrefix = `${prefix}/${entry.name}`;
    if (fs.existsSync(path.join(child, "page.tsx"))) routes.push(childPrefix);
    routes.push(...collectRoutes(child, childPrefix));
  }
  return routes;
}

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flatten(item.children) : [])]);
}

const agentNav = getNavGroups("agent", "en");
const topLevel = agentNav.flatMap((group) => group.items);
const navHrefs = new Set(flatten(topLevel).map((item) => item.href.replace(/^\/en/, "")));
const tabHrefs = new Set((WORKSPACE_BOTTOM_NAV_TABS.agent ?? []).map((tab) => tab.href));

describe("agent navigation", () => {
  // Daily work first (Tasks, Calendar, the account → job → hiring → talent
  // chain), then the occasional pages; Earnings is checked least often, so it
  // closes the rail.
  it("keeps the sidebar to ten top-level rows in working order", () => {
    expect(topLevel.map((item) => item.title)).toEqual([
      "Home",
      "Tasks",
      "Calendar",
      "Accounts",
      "Jobs",
      "Hiring",
      "Job Seekers",
      "Performance",
      "Marketing",
      "Earnings",
    ]);
  });

  it("mirrors the employer's Hiring stages in the same order", () => {
    const hiring = topLevel.find((item) => item.title === "Hiring");
    expect(hiring?.children?.map((child) => child.title)).toEqual([
      "Candidates",
      "Interviews",
      "Offers",
      "Placements",
    ]);
  });

  it("has no sales-course group headings", () => {
    const groups = flatten(topLevel).map((item) => item.group).filter(Boolean);
    expect(groups).toEqual([]);
  });

  it("leaves Messages to the topbar indicator, as employer does", () => {
    expect(navHrefs.has("/agent/messages")).toBe(false);
    expect(tabHrefs.has("/agent/messages")).toBe(false);
  });

  it("groups the rail into Today / Work / Track", () => {
    expect(agentNav.map((group) => [group.label, group.items.map((item) => item.title)])).toEqual([
      ["Today", ["Home", "Tasks", "Calendar"]],
      ["Work", ["Accounts", "Jobs", "Hiring", "Job Seekers"]],
      ["Track", ["Performance", "Marketing", "Earnings"]],
    ]);
  });

  it("keeps the phone tab bar to three daily tabs, so Create and More make five slots", () => {
    expect((WORKSPACE_BOTTOM_NAV_TABS.agent ?? []).map((tab) => tab.href)).toEqual([
      "/agent",
      "/agent/tasks",
      "/agent/candidates",
    ]);
  });

  it("keeps the live counts on the rows that own them", () => {
    const byTitle = Object.fromEntries(flatten(topLevel).map((item) => [item.title, item]));
    expect(byTitle.Tasks.badgeKey).toBe("overdueTasks");
    expect(byTitle.Leads.badgeKey).toBe("dueFollowUps");
  });

  it("points every nav entry at a route that exists", () => {
    for (const href of navHrefs) {
      const relative = href.replace("/agent", "").replace(/^\//, "");
      const dir = relative ? path.join(AGENT_ROOT, relative) : AGENT_ROOT;
      expect({ href, exists: fs.existsSync(path.join(dir, "page.tsx")) }).toEqual({ href, exists: true });
    }
  });

  it("leaves no agent page unreachable", () => {
    const orphans = collectRoutes(AGENT_ROOT).filter(
      (route) => !navHrefs.has(route) && !tabHrefs.has(route) && !(route in REACHED_ELSEWHERE)
    );
    expect(orphans).toEqual([]);
  });

  it("only lists routes that really exist under REACHED_ELSEWHERE", () => {
    for (const route of Object.keys(REACHED_ELSEWHERE)) {
      const relative = route.replace("/agent/", "");
      expect({ route, exists: fs.existsSync(path.join(AGENT_ROOT, relative, "page.tsx")) }).toEqual({
        route,
        exists: true,
      });
    }
  });
});
