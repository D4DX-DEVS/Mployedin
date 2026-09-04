/**
 * @jest-environment node
 */
/**
 * The employer navigation contract.
 *
 * The audit that produced this structure found three finished pages linked from
 * nowhere (assessments, scorecards, screening-analytics) and a thirteen-row
 * sidebar in which the four daily destinations sat beside nine quarterly ones.
 * Two rules keep both from coming back: every nav href must resolve to a real
 * route, and every employer route must be reachable — from the sidebar, from a
 * bottom tab, or from an entry on the list below that says who reaches it.
 */
import fs from "fs";
import path from "path";
import { getNavGroups, type NavItem } from "@/lib/nav/menuConfig";
import { WORKSPACE_BOTTOM_NAV_TABS } from "@/lib/nav/bottomNavTabs";

const EMPLOYER_ROOT = path.join(
  process.cwd(),
  "src",
  "app",
  "[locale]",
  "(dashboard)",
  "employer"
);

/**
 * Routes that are deliberately absent from the sidebar, each with the surface
 * that does reach them. An entry here is a decision, not an oversight — adding
 * one without a reason is how the orphans happened the first time.
 */
const REACHED_ELSEWHERE: Record<string, string> = {
  "/employer/jobs/ai-create": "Create menu + ⌘K action + jobs list header",
  "/employer/jobs/ai-extract": "AI job creator offers the upload path",
  "/employer/jobs/new": "Create menu + ⌘K action (?mode=manual); bare path redirects",
  "/employer/interviews/bulk": "Interviews header + Create menu + ⌘K action",
  "/employer/calendar": "View toggle on the interviews page",
  "/employer/scorecards": "Interviews header link; one is filled while completing an interview",
  "/employer/messages": "Topbar messages indicator, shown at every width",
  "/employer/team": "Parked feature (invite API answers 501); reachable from team activity",
  "/employer/team/accept": "Invite email link",
};

function collectRoutes(dir: string, prefix = "/employer"): string[] {
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

const employerNav = getNavGroups("employer", "en");
const topLevel = employerNav.flatMap((group) => group.items);
const navHrefs = new Set(
  flatten(topLevel).map((item) => item.href.replace(/^\/en/, ""))
);
const tabHrefs = new Set((WORKSPACE_BOTTOM_NAV_TABS.employer ?? []).map((tab) => tab.href));

describe("employer navigation", () => {
  it("keeps the sidebar to six top-level rows", () => {
    expect(topLevel.map((item) => item.title)).toEqual([
      "Home",
      "Jobs",
      "Hiring",
      "Talent",
      "Insights",
      "Settings",
    ]);
  });

  it("points every nav entry at a route that exists", () => {
    for (const href of navHrefs) {
      const relative = href.replace("/employer", "").replace(/^\//, "");
      const dir = relative ? path.join(EMPLOYER_ROOT, relative) : EMPLOYER_ROOT;
      expect({ href, exists: fs.existsSync(path.join(dir, "page.tsx")) }).toEqual({
        href,
        exists: true,
      });
    }
  });

  it("leaves no employer page unreachable", () => {
    const orphans = collectRoutes(EMPLOYER_ROOT).filter(
      (route) =>
        !navHrefs.has(route) && !tabHrefs.has(route) && !(route in REACHED_ELSEWHERE)
    );
    expect(orphans).toEqual([]);
  });

  it("wires the three pages the audit found orphaned", () => {
    expect(navHrefs.has("/employer/assessments")).toBe(true);
    expect(navHrefs.has("/employer/screening-analytics")).toBe(true);
    // Scorecards left the sidebar deliberately: one is filled as the last step
    // of completing an interview, so the interviews page both writes and reads
    // them. It stays reachable — it just is not a menu of its own.
    expect("/employer/scorecards" in REACHED_ELSEWHERE).toBe(true);
  });

  it("groups the whole hiring pipeline under one row", () => {
    const pipeline = topLevel.find((item) => item.title === "Hiring");
    expect(pipeline?.children?.map((child) => child.href.replace("/en", ""))).toEqual([
      "/employer/applications",
      "/employer/interviews",
      "/employer/offers",
      "/employer/placements",
      "/employer/background-checks",
    ]);
  });

  it("keeps configure-once pages inside Settings", () => {
    const settings = topLevel.find((item) => item.title === "Settings");
    const hrefs = settings?.children?.map((child) => child.href.replace("/en", "")) ?? [];
    for (const configured of [
      "/employer/workflow",
      "/employer/matching-weights",
      "/employer/comm-templates",
      "/employer/campaigns",
      "/employer/subscription",
      "/employer/invoices",
      "/employer/payment-setup",
    ]) {
      expect(hrefs).toContain(configured);
    }
  });

  it("still reaches every core workflow after the collapse", () => {
    // Carried over from the previous employer-navigation test: collapsing the
    // sidebar must not cost the employer a destination. Messages and the
    // calendar moved to the topbar and the interviews view toggle, so they are
    // checked against the reachability map rather than the sidebar.
    const reachable = new Set([...navHrefs, ...tabHrefs, ...Object.keys(REACHED_ELSEWHERE)]);
    for (const core of [
      "/employer/jobs",
      "/employer/applications",
      "/employer/interviews",
      "/employer/offers",
      "/employer/placements",
      "/employer/candidates",
      "/employer/talent-pools",
      "/employer/messages",
      "/employer/calendar",
      "/employer/analytics",
      "/employer/settings",
      "/employer/subscription",
      "/employer/invoices",
      "/employer/payment-setup",
    ]) {
      expect({ core, reachable: reachable.has(core) }).toEqual({ core, reachable: true });
    }
  });

  it("gives every group row a landing page among its own children", () => {
    // The sidebar row itself is a toggle (clicking Hiring from Offers must not
    // jump to Applications), but the group's href still names where the phone
    // tab bar and deep links land, so it has to be one of its own children.
    for (const title of ["Jobs", "Hiring", "Talent"]) {
      const item = topLevel.find((entry) => entry.title === title);
      expect({
        title,
        opensOwnPage: item?.children?.some((child) => child.href === item.href) ?? false,
      }).toEqual({ title, opensOwnPage: true });
    }
  });

  it("keeps the phone tab bar at three tabs so Create sits centred", () => {
    // Three tabs plus the raised Create control plus "More" is five slots, and
    // Create takes the middle one. A fourth tab pushed it right of centre and
    // squeezed every label; Messages moved to the header instead.
    expect((WORKSPACE_BOTTOM_NAV_TABS.employer ?? []).map((tab) => tab.key)).toEqual([
      "dashboard",
      "jobs",
      "hiring",
    ]);
  });

  it("gives every phone tab a route that exists", () => {
    for (const tab of WORKSPACE_BOTTOM_NAV_TABS.employer ?? []) {
      const relative = tab.href.replace("/employer", "").replace(/^\//, "");
      const dir = relative ? path.join(EMPLOYER_ROOT, relative) : EMPLOYER_ROOT;
      expect({ href: tab.href, exists: fs.existsSync(path.join(dir, "page.tsx")) }).toEqual({
        href: tab.href,
        exists: true,
      });
    }
  });

  it("carries an Arabic title and description on every entry", () => {
    for (const item of flatten(topLevel)) {
      expect(item.titleAr).toBeTruthy();
      expect(item.descriptionAr).toBeTruthy();
    }
  });
});
