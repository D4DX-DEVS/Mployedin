/* Temporary: measure the real job-seeker frame vs the shared page-container. Delete after audit. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const WIDTHS = [360, 390, 768, 1024, 1280, 1440];

const ROUTES = [
  "/en/job-seeker",
  "/en/job-seeker/jobs",
  "/en/job-seeker/profile",
  "/en/job-seeker/settings",
  "/en/job-seeker/saved-jobs",
  "/en/job-seeker/applications",
  "/en/job-seeker/messages",
  "/en/job-seeker/companies",
];

async function login(page: Page) {
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: /email address/i }).fill("jobseeker@mployedin.com");
  await page.getByLabel(/^Password$/i).fill("JobSeeker@1234");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/en\/job-seeker(\/|$)/, { timeout: 30_000 });
}

const PROBE = `(() => {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const info = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      padX: px(cs.paddingLeft), padY: px(cs.paddingTop),
      maxW: cs.maxWidth, gap: px(cs.rowGap),
      width: Math.round(el.getBoundingClientRect().width),
    };
  };
  const wrap = document.querySelector('.job-seeker-route-content');
  const pc = document.querySelector('.page-container');
  return {
    wrapper: info(wrap),
    pageContainer: info(pc),
    pcIsDirectChild: !!(wrap && pc && pc.parentElement === wrap),
    hasPageContainer: !!pc,
  };
})()`;

test("job-seeker frame probe", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  await login(page);
  const report: Record<string, unknown> = {};
  for (const route of ROUTES) {
    const per: Record<string, unknown> = {};
    await page.setViewportSize({ width: WIDTHS[0], height: 900 });
    try {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(1800);
    } catch (e) {
      report[route] = { navError: String(e).slice(0, 120) };
      continue;
    }
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(450);
      try { per[String(w)] = await page.evaluate(PROBE); } catch (e) { per[String(w)] = { error: String(e).slice(0, 100) }; }
    }
    report[route] = per;
    console.log("done", route);
  }
  fs.writeFileSync(path.join(process.cwd(), "..", "js-frame.json"), JSON.stringify(report, null, 1));
  expect(true).toBe(true);
});
