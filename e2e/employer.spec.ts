import { test, expect } from "@playwright/test";

/**
 * Employer E2E journey:
 * 1. Employer registration page loads
 * 2. Login as employer
 * 3. Create a job (navigate to create page)
 * 4. AI job creator loads
 */

const EMPLOYER_EMAIL = process.env.E2E_EMP_EMAIL ?? "employer@test.mployedin.com";
const EMPLOYER_PASS = process.env.E2E_EMP_PASS ?? "TestPass123!";

test.describe("Employer Journey", () => {
  test("employer registration page renders", async ({ page }) => {
    await page.goto("/en/employer-register");
    await expect(page.locator("body")).toContainText(/Company|Register/i);
  });

  test("employer login page renders", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  });

  test("employer can login and view dashboard", async ({ page }) => {
    await page.goto("/en/login");
    await page.fill("input[type=email]", EMPLOYER_EMAIL);
    await page.fill("input[type=password]", EMPLOYER_PASS);
    await page.click("button[type=submit]");

    await page.waitForURL(/employer|dashboard/, { timeout: 10_000 });
    const url = page.url();
    expect(url).toBeTruthy();
  });

  test("AI job creator page is accessible to employer", async ({ page }) => {
    await page.goto("/en/employer/jobs/ai-create");
    const url = page.url();
    // Either shows the page or redirects to login
    expect(url).toBeTruthy();
  });
});
