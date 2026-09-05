/**
 * @jest-environment node
 */
/**
 * Quick actions are links a user reaches from every page, so a stale href is a
 * dead end everywhere at once — exactly the failure the audit found on
 * `/employer/jobs/new`. These tests resolve each href against the real App
 * Router tree and each label against both locales, because next-intl throws on
 * an unknown key rather than falling back.
 */
import fs from "fs";
import path from "path";
import { WORKSPACE_QUICK_ACTIONS, getQuickActions } from "@/lib/nav/quickActions";
import en from "../../../../messages/en.json";
import ar from "../../../../messages/ar.json";

const DASHBOARD_ROOT = path.join(process.cwd(), "src", "app", "[locale]", "(dashboard)");

const allActions = Object.values(WORKSPACE_QUICK_ACTIONS)
  .flat()
  .filter((action): action is NonNullable<typeof action> => Boolean(action));

function pageExists(href: string): boolean {
  const routePath = href.split("?")[0].replace(/^\//, "");
  return fs.existsSync(path.join(DASHBOARD_ROOT, routePath, "page.tsx"));
}

describe("workspace quick actions", () => {
  it("registers at least one action per workspace role", () => {
    for (const role of ["employer", "admin", "agent", "super_agent"] as const) {
      expect(WORKSPACE_QUICK_ACTIONS[role]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it.each(allActions.map((a) => [a.key, a.href] as const))(
    "%s points at a route that exists (%s)",
    (_key, href) => {
      expect(pageExists(href)).toBe(true);
    }
  );

  it.each(allActions.map((a) => [a.key, a] as const))(
    "%s has a label and description in both locales",
    (_key, action) => {
      const enActions = (en as unknown as Record<string, Record<string, string>>).quickActions;
      const arActions = (ar as unknown as Record<string, Record<string, string>>).quickActions;
      expect(enActions[action.labelKey]).toBeTruthy();
      expect(arActions[action.labelKey]).toBeTruthy();
      if (action.descriptionKey) {
        expect(enActions[action.descriptionKey]).toBeTruthy();
        expect(arActions[action.descriptionKey]).toBeTruthy();
      }
    }
  );

  it("prefixes the locale without disturbing the query string", () => {
    const actions = getQuickActions("employer", "ar");
    const manual = actions.find((a) => a.key === "postJobManual");
    expect(manual?.href).toBe("/ar/employer/jobs/new?mode=manual");
  });

  it("returns an empty list for a role with no actions", () => {
    expect(getQuickActions("not_a_role", "en")).toEqual([]);
    expect(getQuickActions(undefined, "en")).toEqual([]);
  });

  it("keeps the employer Create menu to things that make something new", () => {
    const createKeys = (WORKSPACE_QUICK_ACTIONS.employer ?? [])
      .filter((a) => a.create)
      .map((a) => a.key);
    expect(createKeys).toEqual([
      "postJobAi",
      "postJobManual",
      "scheduleInterviews",
      "newMessage",
    ]);
  });

  it("gates every job-creating action behind jobs:create", () => {
    for (const action of allActions.filter((a) => a.key.startsWith("postJob"))) {
      expect(action.permission).toEqual({ resource: "jobs", action: "create" });
    }
  });
});
