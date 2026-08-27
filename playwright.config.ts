import { defineConfig, devices } from "@playwright/test";

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
  webServer: {
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
  ],
});
