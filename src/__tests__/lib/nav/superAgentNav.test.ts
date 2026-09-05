/**
 * @jest-environment node
 */
/**
 * The super-agent's global action layer.
 *
 * This role had two quick actions, both of them destinations and neither marked
 * `create`, so `CreateMenu` returned null and it was the one workspace role
 * with no way to start anything from outside the page hosting the button — even
 * though five things it creates already existed. It was also absent from
 * ENTITY_SEARCH_ROUTES, so ⌘K could only jump between pages while the search
 * API had been scoping this role correctly all along.
 */
import fs from "fs";
import path from "path";
import { WORKSPACE_QUICK_ACTIONS, getQuickActions } from "@/lib/nav/quickActions";
import { getEntitySearchRoutes } from "@/lib/nav/entitySearch";
import { getNavGroups, getAllNavItems } from "@/lib/nav/menuConfig";
import { WORKSPACE_BOTTOM_NAV_TABS } from "@/lib/nav/bottomNavTabs";

const DASHBOARD_ROOT = path.join(process.cwd(), "src", "app", "[locale]", "(dashboard)");

function pageExists(href: string): boolean {
  const routePath = href.split("?")[0].replace(/^\//, "");
  return fs.existsSync(path.join(DASHBOARD_ROOT, routePath, "page.tsx"));
}

/** Query params a href carries, so each one can be checked against its reader. */
function queryKeys(href: string): string[] {
  const query = href.split("?")[1];
  return query ? [...new URLSearchParams(query).keys()] : [];
}

function pageSource(href: string): string {
  const routePath = href.split("?")[0].replace(/^\//, "");
  return fs.readFileSync(path.join(DASHBOARD_ROOT, routePath, "page.tsx"), "utf8");
}

const superAgentActions = WORKSPACE_QUICK_ACTIONS.super_agent ?? [];

describe("super-agent quick actions", () => {
  it("offers actions the Create menu can render", () => {
    // CreateMenu returns null when a role has no `create` entries, which is
    // exactly what happened here.
    expect(superAgentActions.filter((action) => action.create).length).toBeGreaterThan(0);
  });

  it("covers every create surface the workspace actually has", () => {
    const createHrefs = superAgentActions
      .filter((action) => action.create)
      .map((action) => action.href);

    expect(createHrefs).toEqual(
      expect.arrayContaining([
        "/super-agent/agents?new=1",
        "/super-agent/employers?new=1",
        "/super-agent/invoices/new",
        "/super-agent/referral-links?new=1",
        "/super-agent/target-management/create",
      ])
    );
  });

  it("gates each create action on the permission its API enforces", () => {
    const byKey = Object.fromEntries(superAgentActions.map((a) => [a.key, a]));
    expect(byKey.saAddAgent.permission).toEqual({ resource: "agents", action: "create" });
    expect(byKey.saOnboardEmployer.permission).toEqual({ resource: "employers", action: "create" });
    expect(byKey.saNewInvoice.permission).toEqual({ resource: "invoices", action: "create" });
    expect(byKey.saDistributeTargets.permission).toEqual({ resource: "targets", action: "create" });
  });

  it("points every action at a route that exists", () => {
    for (const action of superAgentActions) {
      expect(pageExists(action.href)).toBe(true);
    }
  });

  it("only links to query params the destination page reads back", () => {
    for (const action of superAgentActions) {
      const source = pageSource(action.href);
      for (const key of queryKeys(action.href)) {
        // Either a filter registered with the URL hook, or an explicitly read flag.
        expect(source.includes(`"${key}"`)).toBe(true);
      }
    }
  });

  it("prefixes the locale without disturbing the query string", () => {
    const actions = getQuickActions("super_agent", "ar");
    expect(actions.find((a) => a.key === "saAddAgent")?.href).toBe(
      "/ar/super-agent/agents?new=1"
    );
  });
});

describe("super-agent entity search", () => {
  const routes = getEntitySearchRoutes("super_agent");

  it("is registered, so ⌘K can return records and not just pages", () => {
    expect(routes).not.toBeNull();
  });

  it("opens a job through the detail dialog this workspace uses instead of a jobs/[id] route", () => {
    expect(fs.existsSync(path.join(DASHBOARD_ROOT, "super-agent", "jobs", "[id]", "page.tsx"))).toBe(
      false
    );
    expect(routes!.job("abc123")).toBe("/super-agent/jobs?job=abc123");
    expect(pageSource("/super-agent/jobs").includes('get("job")')).toBe(true);
  });

  it("sends a candidate hit to the applications list pre-filtered by name", () => {
    expect(routes!.candidate("Ravi Kumar")).toBe(
      "/super-agent/applications?search=Ravi%20Kumar"
    );
    expect(pageSource("/super-agent/applications").includes('"search"')).toBe(true);
  });
});

describe("super-agent navigation badges", () => {
  const items = getAllNavItems("super_agent", "en");

  it("counts the review queue on the entry that holds it", () => {
    const exhibitions = items.find((item) => item.href === "/en/super-agent/exhibitions");
    expect(exhibitions?.badgeKey).toBe("pendingExhibitionReviews");
  });

  it("counts commissions awaiting sign-off", () => {
    const commissions = items.find((item) => item.href === "/en/super-agent/commissions");
    expect(commissions?.badgeKey).toBe("pendingCommissionApprovals");
  });

  it("keeps every phone tab pointing at a real nav destination", () => {
    const hrefs = new Set(getNavGroups("super_agent", "en").flatMap((group) =>
      group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)])
    ));
    for (const tab of WORKSPACE_BOTTOM_NAV_TABS.super_agent ?? []) {
      expect(hrefs.has(`/en${tab.href}`)).toBe(true);
    }
  });
});
