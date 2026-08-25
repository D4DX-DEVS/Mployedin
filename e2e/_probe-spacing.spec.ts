/* Temporary spacing-rhythm probe. Delete after the audit. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EMAIL = process.env.E2E_EMP_EMAIL ?? "employer@mployedin.com";
const PASS = process.env.E2E_EMP_PASS ?? "Employer@1234";

const WIDTHS = [390, 768, 1280, 1440];

const ROUTES = [
  "/en/employer",
  "/en/employer/jobs",
  "/en/employer/candidates",
  "/en/employer/applications",
  "/en/employer/interviews",
  "/en/employer/offers",
  "/en/employer/placements",
  "/en/employer/talent-pools",
  "/en/employer/analytics",
  "/en/employer/invoices",
  "/en/employer/team",
  "/en/employer/settings",
  "/en/employer/scorecards",
  "/en/employer/workflow",
  "/en/employer/job-templates",
  "/en/employer/subscription",
  "/en/employer/activity-history",
  "/en/employer/assessments",
  "/en/employer/background-checks",
  "/en/employer/campaigns",
  "/en/employer/comm-templates",
  "/en/employer/calendar",
  "/en/employer/matching-weights",
  "/en/employer/my-posters",
  "/en/employer/payment-setup",
  "/en/employer/screening-analytics",
];

async function login(page: Page) {
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: /email address/i }).fill(EMAIL);
  await page.getByLabel(/^Password$/i).fill(PASS);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/en\/employer(\/|$)/, { timeout: 30_000 });
}

const PROBE = `(() => {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const container = document.querySelector('main .page-container');
  const containerInfo = container ? (() => {
    const cs = getComputedStyle(container);
    return {
      padTop: px(cs.paddingTop), padX: px(cs.paddingLeft),
      gap: px(cs.rowGap), maxW: cs.maxWidth,
      width: Math.round(container.getBoundingClientRect().width),
      display: cs.display,
    };
  })() : null;

  // top-level sections directly under the page container
  const sections = container ? [...container.children].filter(vis).map((el) => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      padY: px(cs.paddingTop), padX: px(cs.paddingLeft),
      radius: px(cs.borderTopLeftRadius),
      mt: px(cs.marginTop), mb: px(cs.marginBottom),
      border: cs.borderTopWidth === '0px' ? 0 : px(cs.borderTopWidth),
    };
  }) : [];

  // every visible card-ish surface anywhere in main
  const CARD_SEL = 'main .card-base, main .workspace-panel-surface, main .workspace-hero-surface, main [class*="rounded-2xl"], main [class*="rounded-xl"], main [class*="rounded-3xl"]';
  const cards = [];
  for (const el of document.querySelectorAll(CARD_SEL)) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 40) continue; // skip chips/badges/buttons
    if (cs.borderTopWidth === '0px' && cs.boxShadow === 'none' && cs.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
    cards.push({ padY: px(cs.paddingTop), padX: px(cs.paddingLeft), radius: px(cs.borderTopLeftRadius) });
    if (cards.length >= 40) break;
  }

  // grid gaps
  const gaps = [];
  for (const el of document.querySelectorAll('main [class*="grid-cols"], main [class*="gap-"]')) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display !== 'grid' && cs.display !== 'flex') continue;
    const rg = px(cs.rowGap), cg = px(cs.columnGap);
    if (!rg && !cg) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 200) continue; // layout-level only, not chip rows
    gaps.push(rg === cg ? String(rg) : rg + '/' + cg);
    if (gaps.length >= 25) break;
  }

  const heads = {};
  for (const t of ['H1','H2','H3']) {
    const el = [...document.querySelectorAll('main ' + t)].filter(vis)[0];
    if (el) heads[t] = px(getComputedStyle(el).fontSize);
  }

  return { containerInfo, sections, cards, gaps, heads };
})()`;

test("employer spacing probe", async ({ page }) => {
  test.setTimeout(45 * 60 * 1000);
  await login(page);
  const report: Record<string, unknown> = {};
  for (const route of ROUTES) {
    const per: Record<string, unknown> = {};
    await page.setViewportSize({ width: WIDTHS[0], height: 900 });
    try {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(2200);
    } catch (e) {
      report[route] = { navError: String(e).slice(0, 120) };
      continue;
    }
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(550);
      try { per[String(w)] = await page.evaluate(PROBE); }
      catch (e) { per[String(w)] = { error: String(e).slice(0, 120) }; }
    }
    report[route] = per;
    console.log("done", route);
  }
  fs.writeFileSync(path.join(process.cwd(), "..", "employer-spacing.json"), JSON.stringify(report, null, 1));
  expect(true).toBe(true);
});
