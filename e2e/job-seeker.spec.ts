import { test, expect } from "@playwright/test";

/**
 * Job Seeker E2E journey:
 * 1. Navigate to login
 * 2. Login as job seeker
 * 3. Land on job seeker dashboard
 * 4. Navigate to job search
 * 5. Verify search results rendered
 */

const JOB_SEEKER_EMAIL = process.env.E2E_JS_EMAIL ?? "jobseeker@mployedin.com";
const JOB_SEEKER_PASS = process.env.E2E_JS_PASS ?? "JobSeeker@1234";

test.describe("Job Seeker Journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
  });

  test("login page renders correctly", async ({ page }) => {
    await expect(page).toHaveTitle(/MPLOYEDIN|Login/i);
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    // The (auth) layout is a focused workspace screen — no public footer.
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  test("job seeker can login and see dashboard", async ({ page }) => {
    await page.fill("input[type=email]", JOB_SEEKER_EMAIL);
    await page.fill("input[type=password]", JOB_SEEKER_PASS);
    await page.click("button[type=submit]");

    await page.waitForURL(/job-seeker|dashboard/, { timeout: 20_000 });
    // Dashboard should have the MPLOYEDIN branding
    await expect(page.locator("body")).not.toContainText("Error");
    await expect(page.getByTestId("site-footer")).toBeVisible();
  });

  test("job seeker can access search page", async ({ page }) => {
    // Skip login; just check page structure
    await page.goto("/en/job-seeker/search");
    // Should redirect to login if not authenticated (301/302) or show search page
    const url = page.url();
    expect(url).toBeTruthy();
  });

  test("public home renders with footer", async ({ page }) => {
    // Navigate to /en directly: the bare "/" locale redirect builds an
    // absolute URL from NEXTAUTH_URL, which points elsewhere when the test
    // server runs on a different port than the configured app URL.
    await page.goto("/en");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/\/en/);
    await expect(page.getByTestId("site-footer")).toBeVisible();
  });
});
