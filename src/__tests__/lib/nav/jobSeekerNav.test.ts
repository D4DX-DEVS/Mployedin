import fs from "fs";
import path from "path";
import { getNavGroups, getAllNavItems } from "@/lib/nav/menuConfig";
import { WORKSPACE_BOTTOM_NAV_TABS } from "@/lib/nav/bottomNavTabs";

/**
 * The job seeker's navigation used to be authored in `menuConfig` and rendered
 * nowhere — the shell denied the role a sidebar, so 24 entries and eight whole
 * routes had no clickable path on desktop, and three separate hand-written
 * menus drifted apart. These tests pin the invariant that replaced it: one
 * config, and every shipped seeker route reachable from it.
 */

const SEEKER_ROOT = path.join(
  process.cwd(),
  "src",
  "app",
  "[locale]",
  "(dashboard)",
  "job-seeker"
);

/** Routes deliberately absent from the menu, with the reason they are absent. */
const NOT_IN_MENU = new Set([
  // Detail and sub-routes are reached from their list, never from a menu.
  "/job-seeker/jobs/[id]",
  "/job-seeker/companies/[id]",
  "/job-seeker/applications/[id]",
  "/job-seeker/applications/[id]/feedback",
  // Folded into Interviews as a view toggle.
  "/job-seeker/calendar",
  // Delivery channels / digest / unsubscribe. Not a menu entry: it is linked
  // from the Notifications tab of Settings, which owns the simpler toggles.
  "/job-seeker/settings/notifications",
  // Legacy redirect kept so old bookmarks still land on the job feed, which is
  // now the only search surface.
  "/job-seeker/search",
]);

function collectRoutes(dir: string, prefix = "/job-seeker"): string[] {
  const routes: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);
    if (fs.existsSync(path.join(child, "page.tsx"))) {
      routes.push(`${prefix}/${entry.name}`);
    }
    routes.push(...collectRoutes(child, `${prefix}/${entry.name}`));
  }
  return routes;
}

describe("job seeker navigation", () => {
  const items = getAllNavItems("job_seeker", "en");
  const hrefs = new Set(items.map((item) => item.href.replace("/en", "")));

  it("reaches every shipped job-seeker route that is not deliberately excluded", () => {
    const routes = collectRoutes(SEEKER_ROOT).filter((r) => !NOT_IN_MENU.has(r));
    const unreachable = routes.filter((route) => !hrefs.has(route));
    expect(unreachable).toEqual([]);
  });

  it("points every menu entry at a route that exists", () => {
    const missing = items
      .map((item) => item.href.replace("/en", ""))
      .filter((href) => {
        const rel = href.replace("/job-seeker", "");
        const dir = rel ? path.join(SEEKER_ROOT, ...rel.split("/").filter(Boolean)) : SEEKER_ROOT;
        return !fs.existsSync(path.join(dir, "page.tsx"));
      });
    expect(missing).toEqual([]);
  });

  it("gives every entry an Arabic title, so the drawer never falls back to English", () => {
    expect(items.filter((item) => !item.titleAr.trim())).toEqual([]);
  });

  it("groups the menu by the job being done rather than one flat list", () => {
    const groups = getNavGroups("job_seeker", "en");
    // Home is its own unlabelled group; the rest carry a task label.
    const labelled = groups.filter((group) => group.label);
    expect(labelled.length).toBeGreaterThanOrEqual(3);
    expect(labelled.every((group) => group.items.length <= 8)).toBe(true);
  });

  it("links every bottom tab to a destination the menu also knows", () => {
    const tabs = WORKSPACE_BOTTOM_NAV_TABS.job_seeker ?? [];
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs.filter((tab) => !hrefs.has(tab.href))).toEqual([]);
  });

  it("badges only the counters the badge hook actually supplies", () => {
    const supported = new Set([
      "unreadMessages",
      "pendingOffers",
      "interviewsAwaitingResponse",
    ]);
    const unsupported = items
      .filter((item) => item.badgeKey)
      .filter((item) => !supported.has(item.badgeKey as string));
    expect(unsupported).toEqual([]);
  });
});
