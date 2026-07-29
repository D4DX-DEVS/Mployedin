import { test, expect, Page } from "@playwright/test";

/**
 * Regression tests for the 2026-07 client feedback batch:
 *  1. CSRF fetch patch active on PUBLIC pages (shared-link Easy Apply 403 bug)
 *  2. Anonymous CV-first quick-apply panel on public job pages
 *  3. Admin role-switch → Employer profile document is created (job posting fix)
 *  4. Employer applications list shows status badges / matching skills
 *  5. Post-job auto-draft carries the CSRF header (sendBeacon → keepalive fetch fix)
 *
 * Run: npx playwright test e2e/client-fixes.spec.ts --project=chromium
 */

const JS_EMAIL = process.env.E2E_JS_EMAIL ?? "jobseeker@mployedin.com";
const JS_PASS = process.env.E2E_JS_PASS ?? "JobSeeker@1234";
const EMP_EMAIL = process.env.E2E_EMP_EMAIL ?? "employer@test.mployedin.com";
const EMP_PASS = process.env.E2E_EMP_PASS ?? "TestPass123!";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@mployedin.com";
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? "Admin@1234";

async function login(page: Page, email: string, pass: string) {
  await page.goto("/en/login");
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", pass);
  await page.click("button[type=submit]");
  await page.waitForURL(/employer|job-seeker|admin|agent|onboarding/, { timeout: 30_000 });
}

async function csrfCookie(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "csrf-token")?.value ?? "";
}

test.describe("1+2 · Public page CSRF + anonymous quick apply", () => {
  test("anonymous visitor sees CV-first quick apply on a shared job link", async ({ page }) => {
    await page.goto("/en/jobs");
    await page.waitForLoadState("networkidle");

    const jobLink = page.locator('a[href*="/jobs/"]').first();
    if ((await jobLink.count()) === 0) {
      test.skip(true, "No public jobs available to open");
    }
    await jobLink.click();
    await page.waitForURL(/\/jobs\/[a-f0-9]{24}/, { timeout: 15_000 });
    await page.waitForLoadState("networkidle");

    // CV-first panel replaces the old bare "Sign in to Apply" button
    await expect(page.getByText("Apply in seconds")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload your CV/i })).toBeVisible();
  });

  test("logged-in job seeker gets CSRF header on POSTs from PUBLIC pages", async ({ page }) => {
    await login(page, JS_EMAIL, JS_PASS);

    // Public layout page (same layout as a WhatsApp-shared job link)
    await page.goto("/en/jobs");
    await page.waitForLoadState("networkidle");

    const cookieToken = await csrfCookie(page);
    expect(cookieToken, "csrf-token cookie should be set on public pages").toBeTruthy();

    // Probe: fire a POST from the page context and capture what the patched
    // window.fetch actually sends (this is exactly what Easy Apply does).
    let sentHeader: string | null = null;
    await page.route("**/api/__csrf-probe", (route) => {
      sentHeader = route.request().headers()["x-csrf-token"] ?? null;
      return route.fulfill({ status: 204, body: "" });
    });
    await page.evaluate(() => fetch("/api/__csrf-probe", { method: "POST" }));

    expect(sentHeader, "window.fetch on public pages must auto-inject x-csrf-token").toBe(cookieToken);
  });

  test("logged-in job seeker sees the Easy Apply form (not sign-in) on a job page", async ({ page }) => {
    await login(page, JS_EMAIL, JS_PASS);
    await page.goto("/en/jobs");
    await page.waitForLoadState("networkidle");

    const jobLink = page.locator('a[href*="/jobs/"]').first();
    if ((await jobLink.count()) === 0) {
      test.skip(true, "No public jobs available to open");
    }
    await jobLink.click();
    await page.waitForURL(/\/jobs\/[a-f0-9]{24}/, { timeout: 15_000 });
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Apply in seconds")).toHaveCount(0);
    // Either the apply button or the already-applied confirmation must render
    const applyButton = page.getByRole("button", { name: /Easy Apply/i });
    const alreadyApplied = page.getByText(/Application submitted/i);
    await expect(applyButton.or(alreadyApplied).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("3 · Admin role switch creates Employer profile", () => {
  test("converting a job seeker to employer creates the Employer document", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto("/en/admin/users");
    await page.waitForLoadState("networkidle");

    const stamp = Date.now();
    const name = `E2E Convert ${stamp}`;
    const email = `e2e-convert-${stamp}@test.mployedin.com`;
    const token = await csrfCookie(page);
    expect(token).toBeTruthy();
    const headers = { "x-csrf-token": token, "Content-Type": "application/json" };

    // Create a job seeker via the admin API
    const createRes = await page.request.post("/api/admin/users", {
      headers,
      data: { name, email, password: "E2eConvert@1234", role: "job_seeker" },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const created = await createRes.json();
    const userId = created.user._id as string;

    try {
      // Flip the role to employer (single-user mode — the previously broken path)
      const patchRes = await page.request.patch("/api/admin/users", {
        headers,
        data: { userId, role: "employer" },
      });
      expect(patchRes.status(), await patchRes.text()).toBe(200);

      // The fix must have created an Employer doc (companyName defaults to the user's name)
      const empRes = await page.request.get(`/api/employers?search=${encodeURIComponent(name)}&limit=5`);
      expect(empRes.status()).toBe(200);
      const empData = await empRes.json();
      const found = (empData.employers ?? []).some(
        (e: { companyName?: string }) => e.companyName === name
      );
      expect(found, "Employer profile must exist after admin role switch").toBe(true);
    } finally {
      // Cleanup — permanent delete cascades the profile
      await page.request.fetch("/api/admin/users", {
        method: "DELETE",
        headers,
        data: { userId, permanent: true },
      });
    }
  });
});

test.describe("4 · Employer applications list", () => {
  test("list renders with status badges and matching skills, auto-score kicks in", async ({ page }) => {
    let autoScoreFired = false;
    page.on("request", (req) => {
      if (req.url().includes("/api/ai/match") && req.method() === "POST") autoScoreFired = true;
    });

    await login(page, EMP_EMAIL, EMP_PASS);
    await page.goto("/en/employer/applications");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).not.toContainText("Application error");

    const rows = page.locator('[data-testid^="applicant-row-"]');
    const rowCount = await rows.count();
    if (rowCount === 0) {
      test.skip(true, "No applications in the account — badge assertions skipped");
    }

    // Every row now carries a status badge (Applied/Shortlisted/…)
    const firstRow = rows.first();
    await expect(
      firstRow.locator("span", { hasText: /Applied|Shortlisted|Interview|Offer|Selected|Hired|Rejected|Withdrawn/i }).first()
    ).toBeVisible();

    // Auto AI scoring fires when unscored rows exist (soft check — allow all-scored accounts)
    if (!autoScoreFired) {
      const pendingBadges = await page.getByText(/AI Pending/i).count();
      expect(pendingBadges === 0 || autoScoreFired).toBeTruthy();
    }
  });

  test("?status=applied deep link pre-filters the list (dashboard card target)", async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PASS);
    await page.goto("/en/employer/applications?status=applied");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("Application error");
    // Non-applied statuses must not appear in a filtered list
    const rows = page.locator('[data-testid^="applicant-row-"]');
    if ((await rows.count()) > 0) {
      await expect(rows.first().getByText(/Shortlisted|Rejected|Hired/i)).toHaveCount(0);
    }
  });
});

test.describe("5 · Post-job auto-draft", () => {
  test("navigating away from the job form sends an authenticated CSRF draft save", async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PASS);
    // jobs/new shows an AI/manual chooser — ?mode=manual opens the wizard directly
    await page.goto("/en/employer/jobs/new?mode=manual");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("#title", { timeout: 30_000 });

    const title = `E2E Draft ${Date.now()}`;
    await page.fill("#title", title);
    // Let the form register the dirty state
    await page.waitForTimeout(500);

    const draftResponse = page
      .waitForResponse((r) => r.url().includes("/api/jobs/auto-draft"), { timeout: 15_000 })
      .catch(() => null);

    // In-app (client-side) navigation unmounts the wizard → triggers the save
    // that the old sendBeacon version always lost to a CSRF 403.
    await page.getByRole("link", { name: /Dashboard/i }).first().click();
    const resp = await draftResponse;

    expect(resp, "auto-draft request must fire on leaving the form").not.toBeNull();
    expect(resp!.request().headers()["x-csrf-token"], "auto-draft must carry x-csrf-token").toBeTruthy();
    expect([200, 204]).toContain(resp!.status());
  });
});
