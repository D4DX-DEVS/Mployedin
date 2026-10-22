import { existsSync } from "node:fs";
import { defineConfig, devices, webkit } from "@playwright/test";

/** True when Playwright's WebKit build is installed on this machine. */
function webkitInstalled(): boolean {
  try {
    return existsSync(webkit.executablePath());
  } catch {
    return false;
  }
}

/** E2E_BASE_URL names a server other than the shared dev server on :3888 (a production build). */
const PROD_E2E = Boolean(process.env.E2E_BASE_URL) && !/:3888\/?$/.test(process.env.E2E_BASE_URL ?? "");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Diagnostic measurement harnesses are named _*.spec.ts. They need seeded
  // logins and take minutes, so they are out of the suite by default.
  // Run one with: PROBES=1 npx playwright test e2e/_audit-spacing.spec.ts
  testIgnore: process.env.PROBES ? [] : "**/_*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // Must match NEXTAUTH_URL (http://localhost:3888). With 127.0.0.1 here, NextAuth
    // treats the sign-in as cross-host and redirects straight back to /login, so every
    // authenticated spec fails at login before reaching its assertions.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3888",
    trace: "retain-on-failure",
  },
  webServer: PROD_E2E
    ? {
        // A production server started by hand (see e2e/cookie-consent.spec.ts):
        // reuse it, and never fall back to starting the dev server.
        command: `node -e "console.error('Nothing is listening on ${process.env.E2E_BASE_URL}. Start it first: NEXT_DIST_DIR=.next-e2e npx next start -p 3890'); process.exit(1)"`,
        url: `${process.env.E2E_BASE_URL}/en`,
        reuseExistingServer: true,
        timeout: 10_000,
      }
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3888/en",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      // Safari on an iPhone, for the Google-button spec only. It is its own project
      // so that Playwright's fixtures launch and close its browser (the spec
      // bounds how long a WebKit close may take on Windows). Real WebKit when it is
      // installed (npx playwright install webkit), otherwise the same iPhone
      // profile on Chromium.
      name: "iphone-webkit",
      testMatch: "**/firebase-lazy.spec.ts",
      use: webkitInstalled()
        ? { ...devices["iPhone 14"] }
        : { ...devices["iPhone 14"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
  ],
});
