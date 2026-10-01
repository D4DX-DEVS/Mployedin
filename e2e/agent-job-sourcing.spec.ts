import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Client items 2026-10-01, end to end:
 *  1. Job categories are an admin-managed list, and every job form offers it.
 *  2. An agent posts a job with the employer's wizard, for an assigned employer.
 *  3. An agent ranks database candidates against a job and invites one.
 *
 * Runs against the shared staging DB (.env). The read-only checks run in both
 * projects. The publish + invite journey writes, so it runs once (desktop) and
 * only ever invites the seeded test seeker; afterAll soft-deletes the job as
 * admin, which is the only role DELETE /api/jobs/[id] allows.
 */

const AGENT = { email: process.env.E2E_AGENT_EMAIL ?? "agent@mployedin.com", password: process.env.E2E_AGENT_PASS ?? "Agent@1234" };
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@mployedin.com", password: process.env.E2E_ADMIN_PASS ?? "Admin@1234" };
const EMPLOYER = { email: process.env.E2E_EMPLOYER_EMAIL ?? "employer@test.mployedin.com", password: process.env.E2E_EMPLOYER_PASS ?? "TestPass123!" };

/** "QA Audit Company" — a test employer assigned to the seeded agent, not publish-gated. */
const AGENT_EMPLOYER_ID = process.env.E2E_AGENT_EMPLOYER_ID ?? "6aa155ca936b04e5626b5b30";
const AGENT_EMPLOYER_NAME = process.env.E2E_AGENT_EMPLOYER_NAME ?? "QA Audit Company";
/** An active job whose employer is not assigned to the seeded agent. */
const UNASSIGNED_JOB_ID = process.env.E2E_UNASSIGNED_JOB_ID ?? "6abdfc79f5fa7003390c8c65";
/** An active job of an employer assigned to the seeded agent. */
const ASSIGNED_JOB_ID = process.env.E2E_ASSIGNED_JOB_ID ?? "69d4fcaec8dda30f02611884";
/** An employer that is not assigned to the seeded agent. */
const UNASSIGNED_EMPLOYER_ID = process.env.E2E_UNASSIGNED_EMPLOYER_ID ?? "64b000000000000000000009";
/** The seeded job seeker (jobseeker@mployedin.com) — visible, web-stack skills. */
const TEST_SEEKER_ID = process.env.E2E_SEEKER_PROFILE_ID ?? "69d4dba075de4cc2682c3172";

const CATEGORY_PLACEHOLDER = "Select a job category";

type ApiResult = { status: number; json: unknown };

async function login(page: Page, creds: { email: string; password: string }) {
  // The login form re-renders on hydration; filling it too early leaves the
  // submit firing nothing, so wait, then fill and retry the whole login.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/en/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.locator("#email").waitFor();
    await page.waitForTimeout(2500);
    await page.locator("#email").fill(creds.email);
    await page.locator("#password").fill(creds.password);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 });
      return;
    } catch {
      /* retry */
    }
  }
  throw new Error(`Could not sign in as ${creds.email}`);
}

/** Call an API through the page, carrying the CSRF header the app's own fetch sends. */
async function api(page: Page, method: string, url: string, body?: unknown): Promise<ApiResult> {
  await page.waitForFunction(() => document.cookie.includes("csrf-token="), null, { timeout: 30_000 });
  return page.evaluate(
    async (args) => {
      const token = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
      const res = await fetch(args.url, {
        method: args.method,
        headers: { "x-csrf-token": token, ...(args.body === null ? {} : { "Content-Type": "application/json" }) },
        ...(args.body === null ? {} : { body: JSON.stringify(args.body) }),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        /* no body */
      }
      return { status: res.status, json };
    },
    { method, url, body: body ?? null },
  );
}

async function signedInPage(browser: Browser, creds: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await login(page, creds);
  return page;
}

/**
 * Open a SearchableSelect. A tap that lands while the wizard is still
 * hydrating can be swallowed, so retry until the trigger reports it is open.
 */
async function open(trigger: ReturnType<Page["locator"]>) {
  await expect(async () => {
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** Open a SearchableSelect and return its option labels. */
async function optionsOf(page: Page, trigger: ReturnType<Page["locator"]>): Promise<string[]> {
  await open(trigger);
  const panel = page.getByTestId("searchable-select-content");
  await expect(panel.getByRole("option")).not.toHaveCount(0, { timeout: 15_000 });
  const labels = await panel.getByRole("option").allInnerTexts();
  await page.keyboard.press("Escape");
  return labels.map((l) => l.trim());
}

/** Type into an open SearchableSelect and pick the exact option. */
async function choose(page: Page, trigger: ReturnType<Page["locator"]>, label: string) {
  await open(trigger);
  const panel = page.getByTestId("searchable-select-content");
  await panel.locator("input").fill(label);
  await panel.getByRole("option", { name: label, exact: true }).click();
}

/**
 * The wizard's own Next ("Best next improvements" and the Next.js dev-tools
 * button also match "Next"), repeated until the step counter moves: a click
 * that lands while the step is still settling is swallowed.
 */
async function nextStep(page: Page, to: number) {
  const reached = page.getByText(`Step ${to} of 5`).locator("visible=true");
  await expect(async () => {
    if ((await reached.count()) === 0) {
      await page.getByRole("toolbar").getByRole("button", { name: "Next", exact: true }).locator("visible=true").first().click();
    }
    await expect(reached.first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
}

async function openWizard(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await expect(page.locator("#title")).toBeVisible({ timeout: 120_000 });
}

test.describe("job categories (item 1)", () => {
  test("admin manages the list, and the API serves it to every role", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/en/admin/job-attributes/job-categories", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await expect(page.getByRole("heading", { name: "Job categories" }).first()).toBeVisible({ timeout: 120_000 });
    // First page, in admin order, with the Arabic name beside each. Phones get
    // cards instead of table rows, so match the visible names, not row roles.
    for (const name of ["Technology", "التكنولوجيا", "Engineering", "الهندسة"]) {
      await expect(page.getByText(name, { exact: true }).locator("visible=true").first()).toBeVisible();
    }

    const res = await api(page, "GET", "/api/job-categories");
    expect(res.status).toBe(200);
    const names = ((res.json as { items: { name: string }[] }).items ?? []).map((c) => c.name);
    expect(names.length).toBeGreaterThanOrEqual(41);
    for (const name of ["Healthcare", "Engineering", "Sales", "Accounting", "Other"]) expect(names).toContain(name);
  });

  test("employer and agent job forms offer the same managed list", async ({ browser }) => {
    const employer = await signedInPage(browser, EMPLOYER);
    await openWizard(employer, "/en/employer/jobs/new?mode=manual");
    const employerOptions = await optionsOf(employer, employer.getByRole("combobox", { name: CATEGORY_PLACEHOLDER }));

    const agent = await signedInPage(browser, AGENT);
    await openWizard(agent, "/en/agent/jobs/new?mode=manual");
    const agentOptions = await optionsOf(agent, agent.getByRole("combobox", { name: CATEGORY_PLACEHOLDER }));

    const managed = ((await api(agent, "GET", "/api/job-categories")).json as { items: { name: string }[] }).items.map((c) => c.name);
    expect(new Set(agentOptions)).toEqual(new Set(managed));
    expect(new Set(employerOptions)).toEqual(new Set(managed));
    await employer.context().close();
    await agent.context().close();
  });
});

test.describe("agent posts the employer's way (item 2)", () => {
  test("the start screen offers the employer's four ways in, once an employer is picked", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/jobs/new", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Post a job" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Choose the employer this job is for, then pick how to start.")).toBeVisible();
    const options = page.getByRole("list", { name: "Ways to post a job" });
    await expect(options.getByRole("link")).toHaveCount(0);

    await choose(page, page.locator("#job-form-employer"), AGENT_EMPLOYER_NAME);
    await page.waitForURL(new RegExp(`employer=${AGENT_EMPLOYER_ID}`));
    const hrefs = await options.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual([
      `/en/agent/jobs/ai-create?employer=${AGENT_EMPLOYER_ID}`,
      `/en/agent/jobs/new?mode=manual&employer=${AGENT_EMPLOYER_ID}`,
      `/en/agent/jobs/new?from=template&employer=${AGENT_EMPLOYER_ID}`,
      `/en/agent/jobs/ai-extract?employer=${AGENT_EMPLOYER_ID}`,
    ]);
  });

  test("the form: assigned employers only, ?employer preselects, that employer's templates", async ({ page }) => {
    await login(page, AGENT);
    await openWizard(page, `/en/agent/jobs/new?mode=manual&employer=${AGENT_EMPLOYER_ID}`);

    const picker = page.locator("#job-form-employer");
    await expect(picker).toContainText(AGENT_EMPLOYER_NAME);
    // Same five steps as the employer's wizard.
    await expect(page.getByText("Step 1 of 5").locator("visible=true").first()).toBeVisible();
    const templatesRequest = page.waitForRequest((r) => r.url().includes(`/api/employers/job-templates?employerId=${AGENT_EMPLOYER_ID}`));
    await page.getByRole("button", { name: /load template/i }).click();
    expect((await (await templatesRequest).response())?.status()).toBe(200);
    await page.keyboard.press("Escape");

    const rows = ((await api(page, "GET", "/api/employers?limit=500")).json as { employers?: { assignedToMe?: boolean }[]; data?: { assignedToMe?: boolean }[] });
    const assigned = (rows.employers ?? rows.data ?? []).filter((r) => r.assignedToMe).length;
    expect(assigned).toBeGreaterThan(0);
    const options = await optionsOf(page, picker);
    expect(options).toHaveLength(assigned);
  });

  test("the AI creator, upload and template pages open for the picked employer", async ({ page }) => {
    await login(page, AGENT);

    await page.goto(`/en/agent/jobs/ai-create?employer=${AGENT_EMPLOYER_ID}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await expect(page.getByPlaceholder("Describe the role, location, skills").first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("link", { name: /manual job form/i })).toHaveAttribute(
      "href",
      `/en/agent/jobs/new?mode=manual&employer=${AGENT_EMPLOYER_ID}`,
    );

    await page.goto(`/en/agent/jobs/ai-extract?employer=${AGENT_EMPLOYER_ID}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await expect(page.locator('input[type="file"]').first()).toBeAttached({ timeout: 120_000 });

    await page.goto(`/en/agent/jobs/new?from=template&employer=${AGENT_EMPLOYER_ID}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Post from a template" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("link", { name: "Manage templates" })).toHaveCount(0);

    // A template's employer must be one of the agent's; a forged one is refused.
    const forged = await api(page, "GET", `/api/employers/job-templates?employerId=${UNASSIGNED_EMPLOYER_ID}`);
    expect(forged.status).toBe(403);
  });

  test("the AI pages need an employer, and send the agent to pick one", async ({ page }) => {
    await login(page, AGENT);
    for (const flow of ["ai-create", "ai-extract"]) {
      await page.goto(`/en/agent/jobs/${flow}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await page.waitForURL(/\/en\/agent\/jobs\/new$/, { timeout: 120_000 });
    }
  });
});

test.describe("agent job page", () => {
  test("opens the employer's own job page in employer view, and leaving returns to the job", async ({ page, isMobile }) => {
    test.skip(isMobile, "enters and leaves employer view (a session write) — run once, on desktop");
    await login(page, AGENT);
    await page.goto(`/en/agent/jobs/${ASSIGNED_JOB_ID}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    // Back sits above the header, as on the employer's page; status reads like the employer's.
    await expect(page.getByRole("link", { name: "Back to Jobs" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Open employer's job page" }).click();
    await page.waitForURL(new RegExp(`/en/employer/jobs/${ASSIGNED_JOB_ID}$`), { timeout: 120_000 });
    await expect(page.getByText("Viewing as employer:")).toBeVisible({ timeout: 120_000 });
    for (const tab of ["Applications", "Interviews", "Offers", "Hires"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${tab}`) }).first()).toBeVisible();
    }

    await page.getByRole("button", { name: /Back to Agent/ }).click();
    await page.waitForURL(new RegExp(`/en/agent/jobs/${ASSIGNED_JOB_ID}$`), { timeout: 120_000 });
    await expect(page.getByText("Viewing as employer:")).toHaveCount(0);
  });

  test("offers no employer view for a job the agent can only see", async ({ page }) => {
    await login(page, AGENT);
    await page.goto(`/en/agent/jobs/${UNASSIGNED_JOB_ID}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await expect(page.getByRole("button", { name: "Find matching candidates" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("button", { name: "Open employer's job page" })).toHaveCount(0);
  });
});

test.describe("agent sources candidates (item 3)", () => {
  test("a job of an unassigned employer shows the not-assigned state", async ({ page }) => {
    await login(page, AGENT);
    const res = await api(page, "GET", `/api/jobs/${UNASSIGNED_JOB_ID}/matching-candidates`);
    expect(res.status).toBe(403);
    await page.goto(`/en/agent/jobs/${UNASSIGNED_JOB_ID}/matches`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await expect(page.getByText("This job's employer isn't assigned to you")).toBeVisible({ timeout: 120_000 });
  });

  test("the list API validates its page size", async ({ page }) => {
    await login(page, AGENT);
    const res = await api(page, "GET", `/api/jobs/${UNASSIGNED_JOB_ID}/matching-candidates?pageSize=20`);
    expect(res.status).toBe(400);
  });
});

test.describe("agent publishes, ranks and invites (items 2 + 3, writes)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "writes to staging — run once, on desktop");

  let jobId = "";
  const title = `Full Stack Developer (E2E ${Date.now()})`;

  test.afterAll(async ({ browser }) => {
    if (!jobId) return;
    const admin = await signedInPage(browser, ADMIN);
    const res = await api(admin, "DELETE", `/api/jobs/${jobId}`);
    expect(res.status, `cleanup of job ${jobId}`).toBe(200);
    await admin.context().close();
  });

  test("agent posts an active job for an assigned employer", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, AGENT);
    await openWizard(page, `/en/agent/jobs/new?mode=manual&employer=${AGENT_EMPLOYER_ID}`);
    await expect(page.locator("#job-form-employer")).toContainText(AGENT_EMPLOYER_NAME);

    // Step 1
    await page.locator("#title").fill(title);
    await choose(page, page.getByRole("combobox", { name: CATEGORY_PLACEHOLDER }), "Technology");
    await choose(page, page.locator("#location-country"), "United Arab Emirates");
    await page.locator("#location-city").fill("Dubai");
    await nextStep(page, 2);

    // Step 2
    await page.locator("#description").fill(
      "Build and run our web platform end to end: React and Next.js front end, Node.js APIs, MongoDB. " +
        "This posting was created by an automated end-to-end test and is deleted when the test finishes.",
    );
    await nextStep(page, 3);

    // Step 3 — skills the seeded test seeker has, so the ranking has a known match.
    // The placeholder disappears once a skill is added, so hold on to the input itself.
    const skillInput = await page.getByPlaceholder("Type a skill and press Enter (e.g. React, Python)").elementHandle();
    for (const skill of ["React.js", "TypeScript", "Node.js", "MongoDB", "Next.js"]) {
      await skillInput!.fill(skill);
      await skillInput!.press("Enter");
    }
    await expect(page.getByText("5 skills added")).toBeVisible();
    await nextStep(page, 4);

    // Steps 4 and 5 keep their defaults.
    await nextStep(page, 5);
    const responsePromise = page.waitForResponse((r) => /\/api\/jobs(\/[a-f0-9]{24})?$/.test(new URL(r.url()).pathname) && ["POST", "PATCH"].includes(r.request().method()));
    await page.getByRole("toolbar").getByRole("button", { name: "Post Job", exact: true }).locator("visible=true").first().click();
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBeLessThan(300);

    await page.waitForURL(/\/en\/agent\/jobs\/[a-f0-9]{24}$/, { timeout: 120_000 });
    jobId = page.url().split("/").pop() ?? "";
    await expect(page.getByText("Job posted successfully!")).toBeVisible();

    const saved = (await api(page, "GET", `/api/jobs/${jobId}`)).json as { job?: { status?: string; title?: string; category?: string; requirements?: { skills?: string[] } } };
    expect(saved.job).toMatchObject({ status: "active", title, category: "Technology" });
    expect(saved.job?.requirements?.skills).toEqual(expect.arrayContaining(["React.js", "TypeScript"]));
  });

  test("agent opens matching candidates and invites the test seeker once", async ({ page }) => {
    test.setTimeout(300_000);
    expect(jobId, "previous step posted a job").not.toBe("");
    await login(page, AGENT);
    await page.goto(`/en/agent/jobs/${jobId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.getByRole("link", { name: "Find matching candidates" }).click();
    await page.waitForURL(new RegExp(`/agent/jobs/${jobId}/matches`));
    await expect(page.getByText("How this list works")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("article").first()).toBeVisible({ timeout: 120_000 });

    // Where the test seeker ranks, so the click targets their card and nobody else's.
    let rank = 0;
    for (let p = 1; p <= 20 && !rank; p++) {
      const res = await api(page, "GET", `/api/jobs/${jobId}/matching-candidates?page=${p}&pageSize=100`);
      expect(res.status).toBe(200);
      const body = res.json as { data: { jobSeekerId: string; invited?: boolean }[]; totalPages: number };
      const i = body.data.findIndex((c) => c.jobSeekerId === TEST_SEEKER_ID);
      if (i >= 0) {
        expect(body.data[i].invited).toBeFalsy();
        rank = (p - 1) * 100 + i + 1;
      }
      if (p >= body.totalPages) break;
    }
    expect(rank, "test seeker is in the ranked pool").toBeGreaterThan(0);
    // A job asking for the seeker's own skills should put them near the top.
    expect(rank).toBeLessThanOrEqual(100);

    const page100 = Math.ceil(rank / 100);
    await page.goto(`/en/agent/jobs/${jobId}/matches?page=${page100}&limit=100`, { waitUntil: "domcontentloaded" });
    const card = page.locator(`article[aria-label="#${rank} Job Seeker"]`);
    await expect(card).toBeVisible({ timeout: 120_000 });
    await card.getByRole("button", { name: "Invite Job Seeker to apply" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Invite Job Seeker to apply")).toBeVisible();
    await dialog.locator("textarea").fill("Automated end-to-end test invite — please ignore.");
    await dialog.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText("Invite sent to Job Seeker")).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText("Invited")).toBeVisible();

    // The one-invite-per-seeker-per-job guard holds against a repeat request.
    const again = await api(page, "POST", "/api/employer/talent-search/invite", { jobId, jobSeekerId: TEST_SEEKER_ID });
    expect(again.status).toBe(409);
  });
});
