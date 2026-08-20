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
        item("Interviews", "/en/employer/interviews"),
        item("Calendar", "/en/employer/calendar"),
      ],
      "employer",
      "en"
    );
    expect(kept.map((i) => i.title)).toEqual(["Calendar"]);
  });

  it("keeps a parent that shares a tab href so its children stay reachable", () => {
    const kept = withoutBottomTabItems(
      [item("Hiring", "/en/agent/jobs", [item("Jobs", "/en/agent/jobs")])],
      "agent",
      "en"
    );
    expect(kept).toHaveLength(1);
  });

  it("leaves roles without a bottom tab bar untouched", () => {
    const items = [item("Dashboard", "/en/job-seeker")];
    expect(withoutBottomTabItems(items, "job_seeker", "en")).toBe(items);
  });
});
