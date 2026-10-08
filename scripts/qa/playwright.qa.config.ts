import { defineConfig, devices } from "@playwright/test";

/**
 * QA sweep config — uses the locally installed Google Chrome (channel "chrome")
 * so no browser download is needed. Assumes `npm run dev` is already up on 3888.
 * Run: npx playwright test -c scripts/qa/playwright.qa.config.ts e2e/full-role-audit.spec.ts
 */
export default defineConfig({
  testDir: "../../e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  retries: 0,
  workers: 3,
  reporter: [["list"], ["json", { outputFile: "../../qa-reports/playwright-results.json" }]],
  outputDir: "../../qa-reports/test-results",
  use: {
    // 3889: this checkout's server (3888 is used by another local copy of the repo)
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3889",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
