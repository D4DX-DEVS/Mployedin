import fs from "fs";
import path from "path";
import { ADMIN_QUEUE, buildAdminQueue, groupAdminQueue } from "@/lib/admin/actionQueue";

describe("buildAdminQueue", () => {
  it("keeps only rows with something waiting, in definition order", () => {
    const items = buildAdminQueue({
      "jobs-without-applications": 5,
      "invoices-overdue": 2,
      "gdpr-pending": 0,
      "exhibitions-budget": 1,
    });
    expect(items.map((item) => [item.id, item.count])).toEqual([
      ["exhibitions-budget", 1],
      ["invoices-overdue", 2],
      ["jobs-without-applications", 5],
    ]);
  });

  it("drops rows whose count was never computed (no permission)", () => {
    expect(buildAdminQueue({})).toEqual([]);
  });

  it("groups rows and omits empty groups", () => {
    const groups = groupAdminQueue(buildAdminQueue({ "support-tickets": 1, "commissions-pending": 4 }));
    expect(groups.map((group) => group.group)).toEqual(["decisions", "compliance"]);
  });
});

describe("ADMIN_QUEUE destinations", () => {
  const appRoot = path.join(process.cwd(), "src", "app", "[locale]", "(dashboard)");

  it.each(ADMIN_QUEUE.map((definition) => [definition.id, definition.path]))(
    "%s links to a page that exists (%s)",
    (_id, href) => {
      const pathname = href.split("?")[0];
      expect(fs.existsSync(path.join(appRoot, ...pathname.split("/").filter(Boolean), "page.tsx"))).toBe(true);
    },
  );

  it("never repeats an id or a destination", () => {
    expect(new Set(ADMIN_QUEUE.map((definition) => definition.id)).size).toBe(ADMIN_QUEUE.length);
    expect(new Set(ADMIN_QUEUE.map((definition) => definition.path)).size).toBe(ADMIN_QUEUE.length);
  });
});
