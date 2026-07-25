/**
 * Browser-audit every concrete URL emitted by seed-dynamic-route-audit.mjs.
 *
 * Required environment variables:
 *   AUDIT_ADMIN_PASSWORD
 *   AUDIT_SUPER_AGENT_PASSWORD
 *   AUDIT_AGENT_PASSWORD
 *   AUDIT_EMPLOYER_PASSWORD
 *   AUDIT_JOB_SEEKER_PASSWORD
 *
 * Optional:
 *   AUDIT_BASE_URL (default: http://localhost:3000)
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const fixturePath = new URL("../audit-dynamic-fixtures.json", import.meta.url);
const reportPath = new URL("../audit-dynamic-routes-report.json", import.meta.url);

const users = {
  admin: ["admin@mployedin.com", process.env.AUDIT_ADMIN_PASSWORD],
  super_agent: [
    "superagent@mployedin.com",
    process.env.AUDIT_SUPER_AGENT_PASSWORD,
  ],
  agent: ["agent@mployedin.com", process.env.AUDIT_AGENT_PASSWORD],
  employer: ["employer@mployedin.com", process.env.AUDIT_EMPLOYER_PASSWORD],
  job_seeker: [
    "jobseeker@mployedin.com",
    process.env.AUDIT_JOB_SEEKER_PASSWORD,
  ],
};

for (const [role, [, password]] of Object.entries(users)) {
  if (!password) throw new Error(`Missing audit password for ${role}`);
}

const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
const viewports = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const browser = await chromium.launch({ headless: true });
const results = [];

async function login(page, role) {
  const [email, password] = users[role];
  await page.goto(`${baseUrl}/en/login`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), {
      timeout: 30_000,
    }),
    page.locator('button[type="submit"]').click(),
  ]);
}

async function auditRoute(page, role, route, viewport) {
  const consoleErrors = [];
  const requestFailures = [];
  const onConsole = (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  const onRequestFailed = (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    // Next.js cancels speculative RSC/link-prefetch requests when the isolated
    // page closes. They never represent a failed user-visible request.
    if (error === "net::ERR_ABORTED") return;
    requestFailures.push({
      method: request.method(),
      url: request.url(),
      error,
    });
  };
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  let status = null;
  let navigationError = null;
  try {
    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    status = response?.status() ?? null;
    await page.waitForTimeout(700);
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }

  const pageState = await page
    .evaluate(() => ({
      finalUrl: `${location.pathname}${location.search}`,
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }))
    .catch(() => ({
      finalUrl: "",
      title: "",
      heading: "",
      horizontalOverflow: null,
    }));

  page.off("console", onConsole);
  page.off("requestfailed", onRequestFailed);

  const relevantConsoleErrors = consoleErrors.filter(
    (message) =>
      !message.includes("[auth][error]") &&
      !message.includes("401 (Unauthorized)"),
  );
  const pass =
    !navigationError &&
    status !== null &&
    status < 400 &&
    !pageState.finalUrl.includes("/login") &&
    !/404|page not found/i.test(pageState.heading) &&
    (pageState.horizontalOverflow ?? 0) <= 1 &&
    relevantConsoleErrors.length === 0 &&
    requestFailures.length === 0;

  results.push({
    role,
    viewport: viewport.name,
    route,
    status,
    ...pageState,
    consoleErrors: relevantConsoleErrors,
    requestFailures,
    navigationError,
    pass,
  });
}

try {
  for (const [role, routes] of Object.entries(fixtures.routes)) {
    const context = await browser.newContext();
    if (role !== "anonymous") {
      const loginPage = await context.newPage();
      await login(loginPage, role);
      await loginPage.close();
    }

    for (const viewport of viewports) {
      for (const route of routes) {
        // A fresh page prevents aborted prefetches from the preceding route
        // from being misattributed to the route currently under test.
        const page = await context.newPage();
        await page.setViewportSize(viewport);
        await auditRoute(page, role, route, viewport);
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  seedKey: fixtures.seedKey,
  summary: {
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
  },
  results,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));

if (report.summary.failed > 0) process.exitCode = 1;
