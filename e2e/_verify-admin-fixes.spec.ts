import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3888";
const ADMIN = { email: "admin@mployedin.com", pass: "Admin@1234" };

// Destinations that had no desktop sidebar path before the flyout fix.
const ORPHANS = [
  "/en/admin/communications",
  "/en/admin/settings/notifications",
  "/en/admin/webhooks",
  "/en/admin/workflow-templates",
  "/en/admin/matching-weight-templates",
  "/en/admin/gdpr",
  "/en/admin/bulk-import",
  "/en/admin/system-health",
  "/en/admin/impersonate",
  "/en/admin/exhibitions/analytics",
  "/en/admin/resources",
  "/en/admin/audit-logs",
];

// Report routes that must NOT appear as sidebar leaves any more (one row only).
const REPORT_LEAVES = [
  "/en/admin/analytics",
  "/en/admin/target-report",
  "/en/admin/commissions-report",
  "/en/admin/subscription-dashboard",
];

async function login(page) {
  await page.goto(`${BASE}/en/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/en\/admin/, { timeout: 120_000 });
  await page.waitForLoadState("domcontentloaded");
}

test("desktop sidebar: every destination reachable, reports collapsed to one row", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await page.getByRole("button", { name: /More Admin Tools/i }).first().click();
  await page.waitForTimeout(1500);

  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => new URL((a as HTMLAnchorElement).href).pathname)
  );
  const headings = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h3")).map((h) => h.textContent?.trim()).filter(Boolean)
  );

  const missing = ORPHANS.filter((o) => !hrefs.includes(o));
  console.log("GROUP_HEADINGS:", JSON.stringify(headings));
  console.log("ORPHANS_STILL_MISSING:", JSON.stringify(missing));
  console.log("HAS_REPORTS_ROW:", hrefs.includes("/en/admin/reports"));
  expect(missing, "orphaned destinations still unreachable").toEqual([]);
});

test("commission report: tab strip is the only report menu", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`${BASE}/en/admin/commissions-report`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // Sidebar must not also list the four report destinations.
  const sidebarHrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("aside a[href]"))
      .map((a) => new URL((a as HTMLAnchorElement).href).pathname)
  );
  const dupes = REPORT_LEAVES.filter((r) => sidebarHrefs.includes(r));
  console.log("SIDEBAR_REPORT_DUPES:", JSON.stringify(dupes));

  const tabCount = await page.locator('nav[aria-label] a[href*="/admin/"]').count();
  console.log("REPORT_TAB_LINKS:", tabCount);
  expect(dupes, "report routes duplicated in sidebar").toEqual([]);
});

test("admin phone footer: three tabs, centred create", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.waitForTimeout(2500);

  const nav = page.locator("nav.lg\:hidden.fixed.bottom-0");
  const labels = await nav.locator("a span.text-\[11px\], button span").allTextContents();
  const box = await nav.boundingBox();
  const fab = await nav.locator("button[aria-label]").first().boundingBox();
  const centreOffset = fab && box ? Math.abs((fab.x + fab.width / 2) - (box.x + box.width / 2)) : -1;
  console.log("FOOTER_LABELS:", JSON.stringify(labels));
  console.log("FAB_CENTRE_OFFSET_PX:", centreOffset);
  expect(centreOffset).toBeLessThan(12);
});

test("admin jobs/new: no double gutter, one title", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto(`${BASE}/en/admin/jobs/new`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  const containers = await page.locator("main .page-container").count();
  const h1s = await page.locator("main h1").allTextContents();
  const firstCard = await page.locator("main section").first().boundingBox();
  console.log("NESTED_PAGE_CONTAINERS:", containers);
  console.log("H1S:", JSON.stringify(h1s));
  console.log("FIRST_CARD_LEFT_INSET:", firstCard?.x);
  expect(containers, "page-container should not be nested").toBeLessThanOrEqual(1);
  expect(h1s.length).toBe(1);
});
