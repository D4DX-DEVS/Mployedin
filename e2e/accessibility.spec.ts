import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * WCAG 2.2 AA smoke audit of the public, signed-out surfaces (the part of the
 * service most clearly in scope of the European Accessibility Act) plus the
 * consent manager and accessibility settings behaviour.
 *
 * Run: npx playwright test e2e/accessibility.spec.ts
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const PAGES = [
  "/en",
  "/ar",
  "/en/jobs",
  "/en/companies",
  "/en/login",
  "/en/register",
  "/en/privacy",
  "/en/cookies",
  "/en/accessibility",
  "/ar/accessibility",
];

for (const path of PAGES) {
  test(`no WCAG 2.2 AA violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`);
    expect(summary, summary.join("\n")).toEqual([]);
  });
}

test("cookie banner: reject is as easy as accept, nothing optional before a choice", async ({ page, context }) => {
  await page.goto("/en");
  const banner = page.getByRole("region", { name: "Your privacy choices" });
  await expect(banner).toBeVisible();
  const reject = banner.getByRole("button", { name: "Reject all" });
  const accept = banner.getByRole("button", { name: "Accept all" });
  expect(await reject.getAttribute("class")).toBe(await accept.getAttribute("class"));

  const cookiesBefore = (await context.cookies()).map((c) => c.name);
  expect(cookiesBefore).not.toContain("jv");

  await reject.click();
  await expect(banner).toBeHidden();
  const consent = (await context.cookies()).find((c) => c.name === "mp_consent");
  expect(decodeURIComponent(consent?.value ?? "")).toContain("|000|reject_all|");

  // Withdrawal/change stays one click away in the footer.
  await page.getByRole("button", { name: "Cookie settings" }).first().click();
  await expect(page.getByRole("dialog", { name: "Cookie preferences" })).toBeVisible();
});

test("keyboard: skip link is the first tab stop and moves focus to main", async ({ page }) => {
  await page.goto("/en/cookies");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("accessibility settings persist across reloads without a flash", async ({ page }) => {
  await page.goto("/en/accessibility");
  await page.getByRole("button", { name: "Accessibility settings" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Accessibility settings" });
  await dialog.getByText("130%").click();
  await dialog.getByRole("switch", { name: "High contrast" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-a11y-text", "130");
  await expect(html).toHaveAttribute("data-a11y-contrast", "on");
});
