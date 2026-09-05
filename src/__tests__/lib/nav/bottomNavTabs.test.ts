import { withoutBottomTabItems } from "@/lib/nav/bottomNavTabs";
import type { NavItem } from "@/lib/nav/menuConfig";

const item = (title: string, href: string, children?: NavItem[]): NavItem =>
  ({ title, href, icon: "Briefcase", children }) as NavItem;

describe("withoutBottomTabItems", () => {
  it("drops leaf items the employer bottom tab bar already links", () => {
    const kept = withoutBottomTabItems(
      [
        item("Dashboard", "/en/employer"),
        item("Jobs", "/en/employer/jobs"),
        item("Applications", "/en/employer/applications"),
        item("Calendar", "/en/employer/calendar"),
      ],
      "employer",
      "en"
    );
    // Messages is no longer a tab — it is a header control at every width — so
    // it is no longer pruned from the drawer either.
    expect(kept.map((i) => i.title)).toEqual(["Calendar"]);
  });

  it("keeps a parent that shares a tab href while it still has non-tab children", () => {
    const kept = withoutBottomTabItems(
      [
        item("Hiring", "/en/agent/jobs", [
          item("Jobs", "/en/agent/jobs"),
          item("Job Templates", "/en/agent/job-templates"),
        ]),
      ],
      "agent",
      "en"
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].children?.map((c) => c.title)).toEqual(["Job Templates"]);
  });

  it("prunes tab-linked children inside groups and drops a group left empty", () => {
    const kept = withoutBottomTabItems(
      [
        item("Team", "/en/super-agent/agents", [
          item("Agents", "/en/super-agent/agents"),
          item("Employers", "/en/super-agent/employers"),
        ]),
        item("Hiring", "/en/super-agent/leads", [item("Leads", "/en/super-agent/leads")]),
      ],
      "super_agent",
      "en"
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe("Team");
    expect(kept[0].children?.map((c) => c.title)).toEqual(["Employers"]);
  });

  it("leaves a role with no bottom tab bar untouched", () => {
    // Every role in WORKSPACE_BOTTOM_NAV_TABS now has tabs, so this pins the
    // fall-through for a role that is absent from the map entirely.
    const items = [item("Dashboard", "/en/unknown")];
    expect(withoutBottomTabItems(items, "not_a_role", "en")).toBe(items);
  });
});
