import { getNavGroups } from "@/lib/nav/menuConfig";

describe("employer task-based navigation", () => {
  it("keeps seven focused top-level destinations and preserves every core workflow", () => {
    const items = getNavGroups("employer", "en").flatMap((group) => group.items);

    expect(items.map((item) => item.title)).toEqual([
      "Dashboard",
      "Jobs",
      "Pipeline",
      "Talent",
      "Engage",
      "Insights",
      "Company",
    ]);

    const hrefs = items.flatMap((item) => [
      item.href,
      ...(item.children ?? []).map((child) => child.href),
    ]);

    expect(hrefs).toEqual(expect.arrayContaining([
      "/en/employer/jobs",
      "/en/employer/applications",
      "/en/employer/interviews",
      "/en/employer/offers",
      "/en/employer/placements",
      "/en/employer/candidates",
      "/en/employer/talent-pools",
      "/en/employer/messages",
      "/en/employer/calendar",
      "/en/employer/analytics",
      "/en/employer/settings",
      "/en/employer/subscription",
      "/en/employer/invoices",
      "/en/employer/payment-setup",
    ]));
  });
});
