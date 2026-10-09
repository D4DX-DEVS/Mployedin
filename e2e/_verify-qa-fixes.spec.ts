import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import JSZip from "jszip";

/**
 * QA-fix verification for the Super Agent report (Oct 2026) + Agent report (Oct 2026).
 * Read-only except login + search typing + one downloads check (no records created/changed).
 * Run: PROBES=1 npx playwright test e2e/_verify-qa-fixes.spec.ts --project=desktop-chromium --workers=1
 */

const SA = {
  email: process.env.E2E_SA_EMAIL ?? "superagent@mployedin.com",
  password: process.env.E2E_SA_PASS ?? "SuperAgent@1234",
};
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@mployedin.com",
  password: process.env.E2E_ADMIN_PASS ?? "Admin@1234",
};
const AGENT = {
  email: process.env.E2E_AGENT_EMAIL ?? "agent@mployedin.com",
  password: process.env.E2E_AGENT_PASS ?? "Agent@1234",
};

test.describe.configure({ mode: "serial", timeout: 240_000 });

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/en/login", { waitUntil: "networkidle" });
  // BUG-01 shape: login must land on a dashboard, never an error page.
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 120_000 });
  expect(page.url()).not.toMatch(/error|503|504/);
}

async function apiGet(page: Page, url: string) {
  return page.evaluate(async (u) => {
    const res = await fetch(u);
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* no body */
    }
    return { status: res.status, json };
  }, url);
}

/** Returns what a mouse click at the centre of `selector` would actually hit. */
async function hitAtCenter(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return { box: null, hit: "NO-BOX" };
  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return "NOTHING";
      const labelled = el.closest("button, a, [role='button']");
      return (
        labelled?.getAttribute("aria-label") ??
        labelled?.textContent?.trim().slice(0, 30) ??
        el.tagName
      );
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  return { box, hit };
}

test.describe("QA fixes: super-agent (authenticated)", () => {
  test("BUG-03: dashboard vs territory vs applications counts agree", async ({ page }) => {
    await login(page, SA);
    const [dash, terr, apps] = await Promise.all([
      apiGet(page, "/api/super-agent/dashboard"),
      apiGet(page, "/api/super-agent/territory"),
      apiGet(page, "/api/super-agent/applications?limit=1"),
    ]);
    expect(dash.status).toBe(200);
    expect(terr.status).toBe(200);
    expect(apps.status).toBe(200);
    const d = dash.json as { kpis: { activeJobs: number; totalApplications: number } };
    const t = terr.json as { stats: { totalJobs: number } };
    const a = apps.json as { total: number };
    console.log(
      `COUNTS dashboard.activeJobs=${d.kpis.activeJobs} territory.totalJobs=${t.stats.totalJobs} ` +
        `dashboard.applications=${d.kpis.totalApplications} applications.total=${a.total}`,
    );
    expect(t.stats.totalJobs).toBe(d.kpis.activeJobs);
    expect(a.total).toBe(d.kpis.totalApplications);
  });

  test("BUG-02: Copilot FAB does not cover Last-page on SA leads (desktop)", async ({ page }) => {
    await login(page, SA);
    await page.evaluate(() => localStorage.removeItem("copilot-fab-pos"));
    await page.goto("/en/super-agent/leads", { waitUntil: "networkidle" });
    const next = page.locator('button[aria-label="Next page"], button[title="Next page"]').first();
    if ((await next.count()) === 0) test.skip(true, "no pagination on leads with current data");
    await next.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    const last = 'button[aria-label="Last page"], button[title="Last page"]';
    const { hit } = await hitAtCenter(page, last);
    console.log(`LEADS-DESKTOP last-page hit="${hit}"`);
    expect(hit.toLowerCase()).not.toContain("copilot");
  });

  test("BUG-05: leading/trailing spaces are trimmed in agent search", async ({ page }) => {
    await login(page, SA);
    await page.goto("/en/super-agent/agents", { waitUntil: "networkidle" });
    const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
    if ((await search.count()) === 0) test.skip(true, "no search box on agents page");
    const [req] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes("/api/super-agent/agents") && r.url().includes("search="),
        { timeout: 30_000 },
      ),
      search.fill("  sara  "),
    ]);
    const sent = new URL(req.url()).searchParams.get("search");
    console.log(`AGENTS-SEARCH sent="${sent}"`);
    expect(sent).toBe("sara");
  });

  test("BUG-06: invoice no-match shows results copy, not first-run copy", async ({ page }) => {
    await login(page, SA);
    await page.goto("/en/super-agent/invoices", { waitUntil: "networkidle" });
    const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
    if ((await search.count()) === 0) test.skip(true, "no search box on invoices page");
    await search.fill("zzqxj9");
    await expect(page.getByText(/match your search/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/will appear here when agents create them/i)).toHaveCount(0);
  });

  test("BUG-08: title sort endpoint is 200 and case-insensitive", async ({ page }) => {
    await login(page, SA);
    const res = await apiGet(page, "/api/super-agent/jobs?sortBy=title&sortOrder=desc&limit=50");
    expect(res.status).toBe(200);
    const jobs = ((res.json as { jobs?: Array<{ title?: string }> })?.jobs ?? []).map((j) =>
      String(j.title ?? ""),
    );
    console.log(`JOBS-SORT rows=${jobs.length} first3=${JSON.stringify(jobs.slice(0, 3))}`);
    for (let i = 1; i < jobs.length; i++) {
      expect(
        jobs[i - 1].localeCompare(jobs[i], "en", { sensitivity: "base" }),
        `out of order: "${jobs[i - 1]}" before "${jobs[i]}"`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  test("BUG-04: settings currency copy no longer promises silent conversion", async ({ page }) => {
    await login(page, SA);
    await page.goto("/en/super-agent/settings", { waitUntil: "networkidle" });
    const regionTab = page.locator('nav button', { hasText: /region.*currency/i }).first();
    if ((await regionTab.count()) > 0) await regionTab.click();
    await expect(page.getByText(/never silently converted/i)).toBeVisible({ timeout: 30_000 });
  });

  test("BUG-09: action-counts endpoint reachable (badge source)", async ({ page }) => {
    await login(page, SA);
    const res = await apiGet(page, "/api/super-agent/action-counts");
    expect(res.status).toBe(200);
  });
});

test.describe("QA fixes: cross-role Copilot + login", () => {
  test("admin login lands on dashboard (no 503/504 page)", async ({ page }) => {
    await login(page, ADMIN);
    expect(page.url()).toContain("/admin");
  });

  test("BUG-02: Copilot FAB does not cover Last-page on admin list (desktop)", async ({ page }) => {
    await login(page, ADMIN);
    await page.evaluate(() => localStorage.removeItem("copilot-fab-pos"));
    await page.goto("/en/admin/users", { waitUntil: "networkidle" });
    const last = 'button[aria-label="Last page"], button[title="Last page"]';
    if ((await page.locator(last).count()) === 0) test.skip(true, "no last-page control on admin/users");
    await page.locator(last).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    const { hit } = await hitAtCenter(page, last);
    console.log(`ADMIN-DESKTOP last-page hit="${hit}"`);
    expect(hit.toLowerCase()).not.toContain("copilot");
  });
});

test.describe("QA fixes: agent module (authenticated)", () => {
  test("agent login lands on dashboard (no 503/504 page)", async ({ page }) => {
    await login(page, AGENT);
    expect(page.url()).toContain("/agent");
  });

  test("BUG-01: exhibition summary matches the list total", async ({ page }) => {
    await login(page, AGENT);
    const res = await apiGet(page, "/api/exhibitions?limit=1");
    expect(res.status).toBe(200);
    const j = res.json as { total: number; summary: { total: number; pendingReview: number; approved: number } };
    console.log(`EXHIBITIONS total=${j.total} summary=${JSON.stringify(j.summary)}`);
    expect(j.summary.total).toBe(j.total);
  });

  test("BUG-02: invoice Pending agrees between analytics and list", async ({ page }) => {
    await login(page, AGENT);
    // Analytics is single-currency scoped (?currency=INR) while the list also
    // carries a cross-currency total — compare the matching INR slice.
    const [analytics, list] = await Promise.all([
      apiGet(page, "/api/invoices/analytics?period=1y&currency=INR"),
      apiGet(page, "/api/invoices?limit=1"),
    ]);
    expect(analytics.status).toBe(200);
    expect(list.status).toBe(200);
    const pending = (analytics.json as { kpi: { pendingRevenue: number } }).kpi.pendingRevenue;
    const inr = ((list.json as { summary: { byCurrency: { currency: string; totalBalance: number }[] } }).summary.byCurrency ?? [])
      .find((r) => r.currency === "INR")?.totalBalance ?? 0;
    console.log(`INVOICE-PENDING analytics(INR)=${pending} list(INR)=${inr}`);
    expect(pending).toBeGreaterThan(0);
    expect(pending).toBe(inr);
  });

  test("BUG-04: agent analytics agrees with the list APIs", async ({ page }) => {
    await login(page, AGENT);
    const [analytics, apps, jobs, employers] = await Promise.all([
      apiGet(page, "/api/agent/analytics"),
      apiGet(page, "/api/applications?limit=1"),
      apiGet(page, "/api/jobs?limit=1"),
      apiGet(page, "/api/employers?limit=1"),
    ]);
    for (const [name, r] of [["analytics", analytics], ["apps", apps], ["jobs", jobs], ["employers", employers]] as const) {
      expect(r.status, `${name} failed`).toBe(200);
    }
    const a = analytics.json as { kpis: { totalApplications: number; activeJobs: number; employers: number } };
    const appTotal = (apps.json as { pagination: { total: number } }).pagination.total;
    const jobTotal = (jobs.json as { pagination: { total: number } }).pagination.total;
    const empTotal = (employers.json as { pagination: { total: number } }).pagination?.total
      ?? (employers.json as { total: number }).total;
    console.log(`ANALYTICS apps=${a.kpis.totalApplications} vs list=${appTotal}; jobs=${a.kpis.activeJobs} vs list-active<=${jobTotal}; employers=${a.kpis.employers} vs list=${empTotal}`);
    expect(a.kpis.totalApplications).toBe(appTotal);
    expect(a.kpis.employers).toBe(empTotal);
  });

  test("BUG-06: employers CSV export covers the full set, not the page", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/employers", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /export/i }).first().click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByRole("menuitem", { name: /csv/i }).click(),
    ]);
    const file = await download.path();
    expect(file).toBeTruthy();
    const lines = fs.readFileSync(file as string, "utf8").trim().split("\n");
    const totalText = await page.locator("main, body").first().textContent();
    console.log(`EMPLOYERS-CSV rows=${lines.length - 1}`);
    // Page size is 10 — a current-page-only export would hold <= 10 rows.
    expect(lines.length - 1).toBeGreaterThan(10);
    expect(totalText).toMatch(/\d+ employer accounts/i);
  });

  test("BUG-10: tasks search trims spaces", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/tasks", { waitUntil: "networkidle" });
    const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
    if ((await search.count()) === 0) test.skip(true, "no search box on tasks page");
    const [req] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes("/api/agent/tasks") && r.url().includes("search="),
        { timeout: 30_000 },
      ),
      search.fill("  Beta Industries  "),
    ]);
    expect(new URL(req.url()).searchParams.get("search")).toBe("Beta Industries");
  });

  test("BUG-11: leads no-match shows results copy", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/leads", { waitUntil: "networkidle" });
    const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
    if ((await search.count()) === 0) test.skip(true, "no search box on leads page");
    await search.fill("zzqxj9");
    await expect(page.getByText(/no leads match your search/i)).toBeVisible({ timeout: 30_000 });
  });

  test("BUG-12+13: title capped at 200; Cancel resets the form", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/tasks", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /new task/i }).first().click();
    const title = page.locator('input[placeholder*="title" i], input[placeholder*="task" i]').first();
    // BUG-12: the field itself refuses more than 200 chars (QA's suggested fix).
    await expect(title).toHaveAttribute("maxlength", "200");
    // BUG-13: Cancel drops the draft — reopening shows an empty form.
    await title.fill("draft title");
    await page.getByRole("button", { name: /cancel/i }).first().click();
    await page.getByRole("button", { name: /new task/i }).first().click();
    await expect(page.locator('input[placeholder*="title" i], input[placeholder*="task" i]').first()).toHaveValue("");
  });

  test("BUG-15: leads Excel download is a genuine .xlsx", async ({ page }) => {
    await login(page, AGENT);
    await page.goto("/en/agent/leads", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /export/i }).first().click();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByRole("menuitem", { name: /excel/i }).click(),
    ]);
    const suggested = download.suggestedFilename();
    console.log(`LEADS-EXCEL file=${suggested}`);
    expect(suggested).toMatch(/\.xlsx$/i);
    const file = await download.path();
    const zip = await JSZip.loadAsync(fs.readFileSync(file as string));
    const sheet = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
    expect(sheet).toBeDefined();
    expect(sheet).not.toContain("<!doctype");
  });

  test("BUG-14+16: reports funnel says Won; commissions use agent currency", async ({ page }) => {
    await login(page, AGENT);
    const settings = await apiGet(page, "/api/agent/settings");
    const currency = (settings.json as { settings: { currencyCode: string } }).settings.currencyCode;
    console.log(`AGENT-CURRENCY=${currency}`);
    await page.goto("/en/agent/reports", { waitUntil: "networkidle" });
    await expect(page.getByText("Won", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    const summary = await page.locator("section", { hasText: /commission summary/i }).first().textContent();
    // formatCurrency renders symbols (₹/$) for some currencies, codes for others.
    const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency;
    expect(summary).toContain(symbol);
  });
});
