import { test, expect, type Page } from "@playwright/test";

/**
 * Diagnostic for TABLE-CONSISTENCY-AUDIT.md §5 referral-links fixes:
 * status column 2 (phone-card rule S11), guarded row click on phones,
 * destructive Disable as its own confirmed button (RowActions single-menu
 * promotion, owner 2026-09-28), "All" filter mapping.
 *
 * Underscore prefix: out of the default suite, run explicitly:
 * npx playwright test e2e/_verify-sa-referral-links.spec.ts
 */

const SUPER_AGENT = {
  email: process.env.E2E_SA_EMAIL ?? "superagent@mployedin.com",
  password: process.env.E2E_SA_PASS ?? "SuperAgent@1234",
};

test.describe.configure({ mode: "serial", timeout: 240_000 });

async function login(page: Page) {
  await page.goto("/en/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(SUPER_AGENT.email);
  await page.locator("#password").fill(SUPER_AGENT.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 120_000 });
}

async function openPage(page: Page) {
  await login(page);
  await page.goto("/en/super-agent/referral-links", { waitUntil: "networkidle" });
  await page
    .locator("table thead th, :text('No referral links yet')")
    .first()
    .waitFor({ timeout: 60_000 });
}

const hasRows = (page: Page) => page.locator("table tbody tr").count().then((n) => n > 0);

test("header order is Code, Status, … Actions", async ({ page }) => {
  await openPage(page);
  test.skip(!(await hasRows(page)), "no referral links visible to the seeded super-agent");
  const headers = page.locator("table thead tr th");
  await expect(headers.nth(0)).toHaveText("Code");
  await expect(headers.nth(1)).toHaveText("Status");
  await expect(headers.last()).toHaveText("Actions");
});

test("destructive toggle is its own button, not buried in More", async ({ page }) => {
  await openPage(page);
  test.skip(!(await hasRows(page)), "no referral links visible to the seeded super-agent");
  const row = page.locator("table tbody tr").first();
  // Single-item menu is promoted to a standalone button (RowActions).
  await expect(row.getByRole("button", { name: /^(Disable|Enable)$/ })).toBeVisible();
  // …so no More menu exists on the row.
  await expect(row.getByRole("button", { name: /^More actions for / })).toHaveCount(0);
});

test("phone tap expands the card but not the registrations drawer", async ({ page }) => {
  await openPage(page);
  const diag = await page.evaluate(() => ({
    w: window.innerWidth,
    matches: window.matchMedia("(max-width: 639px)").matches,
  }));
  console.log(`viewport: ${JSON.stringify(diag)}`);
  test.skip(!diag.matches, "phone-card guard only applies below 640px");
  test.skip(!(await hasRows(page)), "no referral links visible to the seeded super-agent");
  const row = page.locator("table tbody tr").first();
  await row.locator("td").first().tap();
  await expect(row).toHaveAttribute("data-mobile-expanded", "");
  await expect(page.getByText(/^Registrations \(\d+\)$/)).toHaveCount(0);
  // Chevron stays the phone entry point for the drawer.
  await row.getByRole("button", { name: "Show details" }).tap();
  await expect(page.getByText(/^Registrations \(\d+\)$/)).toHaveCount(1);
});
