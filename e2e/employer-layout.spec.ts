import { expect, test } from "@playwright/test";

const EMPLOYER_EMAIL = process.env.E2E_EMP_EMAIL ?? "employer@mployedin.com";
const EMPLOYER_PASS = process.env.E2E_EMP_PASS ?? "Employer@1234";

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 1100 },
  { label: "tablet", width: 1024, height: 1100 },
  { label: "mobile", width: 390, height: 844 },
] as const;

async function loginEmployer(page: import("@playwright/test").Page) {
  await page.goto("/en/login");
  await page.getByRole("textbox", { name: /email address/i }).fill(EMPLOYER_EMAIL);
  await page.getByLabel(/^Password$/i).fill(EMPLOYER_PASS);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/en\/employer(\/|$)/, { timeout: 15_000 });
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth > 1;
  });

  expect(hasOverflow).toBe(false);
}

test("employer dashboard and training layouts stay readable across viewports", async ({ page }, testInfo) => {
  await loginEmployer(page);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto("/en/employer");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /New Job Posting/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${viewport.label}.png`),
      fullPage: true,
    });

    await page.goto("/en/employer/training");
    await expect(page.getByRole("heading", { name: /Training Tracker/i })).toBeVisible();
    await expect(page.getByTestId("training-form-toggle")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`training-${viewport.label}.png`),
      fullPage: true,
    });
  }
});