/**
 * @jest-environment node
 */
/**
 * Admin's navigation had no guard at all, while the other five workspace roles
 * each had one. It is also the largest surface — 49 menuConfig entries and the
 * widest set of quick actions — so it is the role where a renamed folder or a
 * dropped nav entry is most likely to strand a page with nothing linking to it.
 *
 * These checks are deliberately structural: every destination must exist on
 * disk, every query param must be read by the page it is handed to, and every
 * phone tab must correspond to a real rail destination.
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

function queryKeys(href: string): string[] {
  const query = href.split("?")[1];
  return query ? [...new URLSearchParams(query).keys()] : [];
}

/**
 * Several admin pages are thin wrappers that hand everything to a shared
 * component — `/admin/messages` is 18 lines around `UnifiedMessagesPage`, which
 * is where its `?tab=` handling lives. Reading only the page file would report
 * those params as unread, so follow the page's own `@/` imports one level down
 * and search them too.
 */
function pageSource(href: string): string {
  const routePath = href.split("?")[0].replace(/^\//, "");
  const pageFile = path.join(DASHBOARD_ROOT, routePath, "page.tsx");
  const source = fs.readFileSync(pageFile, "utf8");

  const imported = [...source.matchAll(/from\s+"@\/([^"]+)"/g)]
    .map((match) => path.join(process.cwd(), "src", match[1]))
    .flatMap((base) => [`${base}.tsx`, `${base}.ts`])
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => fs.readFileSync(candidate, "utf8"));

  return [source, ...imported].join("\n");
}

const adminActions = WORKSPACE_QUICK_ACTIONS.admin ?? [];

describe("admin quick actions", () => {
  it("offers actions the Create menu can render", () => {
    expect(adminActions.filter((action) => action.create).length).toBeGreaterThan(0);
  });

  it("points every action at a route that exists", () => {
    for (const action of adminActions) {
      expect({ key: action.key, exists: pageExists(action.href) }).toEqual({
        key: action.key,
        exists: true,
      });
    }
  });

  it("only links to query params the destination page reads back", () => {
    for (const action of adminActions) {
      const source = pageSource(action.href);
      for (const key of queryKeys(action.href)) {
        expect({ key: action.key, param: key, read: source.includes(`"${key}"`) }).toEqual({
          key: action.key,
          param: key,
          read: true,
        });
      }
    }
  });

  it("prefixes the locale without disturbing the query string", () => {
    const actions = getQuickActions("admin", "ar");
    const flagged = actions.find((a) => a.href.includes("?"));
    expect(flagged?.href.startsWith("/ar/admin/")).toBe(true);
    expect(flagged?.href).toContain("?");
  });
});

describe("admin navigation", () => {
  it("points every rail destination at a page that exists", () => {
    // Nav entries carry the locale prefix; strip it back off to hit the folder.
    const hrefs = getAllNavItems("admin", "en").map((item) => item.href.replace(/^\/en/, ""));
    const missing = hrefs.filter((href) => !pageExists(href));
    expect(missing).toEqual([]);
  });

  it("keeps every phone tab pointing at a real nav destination", () => {
    const hrefs = new Set(
      getNavGroups("admin", "en").flatMap((group) =>
        group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)])
      )
    );
    for (const tab of WORKSPACE_BOTTOM_NAV_TABS.admin ?? []) {
      expect({ tab: tab.key, linked: hrefs.has(`/en${tab.href}`) }).toEqual({
        tab: tab.key,
        linked: true,
      });
    }
  });
});

describe("admin entity search", () => {
  const routes = getEntitySearchRoutes("admin");

  it("is registered, so ⌘K can return records and not just pages", () => {
    expect(routes).not.toBeNull();
  });

  it("opens a job through the list's own detail param", () => {
    expect(routes!.job("abc123")).toBe("/admin/jobs?job=abc123");
    expect(pageSource("/admin/jobs").includes('"job"')).toBe(true);
  });

  it("sends a candidate hit to the job-seeker list pre-filtered by name", () => {
    expect(routes!.candidate("Ravi Kumar")).toBe("/admin/job-seekers?search=Ravi%20Kumar");
    expect(pageSource("/admin/job-seekers").includes('"search"')).toBe(true);
  });
});
