/* Temporary audit probe — not part of the suite. Delete after the audit. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EMAIL = process.env.E2E_EMP_EMAIL ?? "employer@mployedin.com";
const PASS = process.env.E2E_EMP_PASS ?? "Employer@1234";

const WIDTHS = [360, 375, 390, 430, 768, 900, 1024, 1280, 1440];

const ROUTES = [
  "/en/employer",
  "/en/employer/jobs",
  "/en/employer/jobs/new",
  "/en/employer/jobs/new?mode=manual",
  "/en/employer/candidates",
  "/en/employer/applications",
  "/en/employer/interviews",
  "/en/employer/offers",
  "/en/employer/placements",
  "/en/employer/talent-pools",
  "/en/employer/analytics",
  "/en/employer/messages",
  "/en/employer/invoices",
  "/en/employer/team",
  "/en/employer/settings",
  "/en/employer/scorecards",
  "/en/employer/workflow",
  "/en/employer/calendar",
  "/en/employer/job-templates",
  "/en/employer/subscription",
  "/en/employer/activity-history",
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
  const de = document.documentElement;
  const vw = de.clientWidth;
  const seen = new Set();
  const key = (el) => el.tagName + '.' + (typeof el.className === 'string' ? el.className.split(' ').slice(0,3).join('.') : '');

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // --- horizontal overflow ---
  const overflowers = [];
  for (const el of document.querySelectorAll('main *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      const k = key(el);
      if (seen.has(k)) continue;
      seen.add(k);
      overflowers.push({ k, right: Math.round(r.right), left: Math.round(r.left), text: (el.textContent||'').trim().slice(0,50) });
    }
    if (overflowers.length >= 8) break;
  }

  // --- scrollable-x containers (may be intentional) ---
  const xscroll = [];
  for (const el of document.querySelectorAll('main *')) {
    if (!visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2) {
      const cs = getComputedStyle(el);
      xscroll.push({ k: key(el), ov: cs.overflowX, sw: el.scrollWidth, cw: el.clientWidth });
    }
    if (xscroll.length >= 8) break;
  }

  // --- touch targets ---
  const small = [];
  for (const el of document.querySelectorAll('main button, main a[href], main [role="button"], main input[type=checkbox], main select')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 24 || r.width < 24) {
      small.push({ k: key(el), w: Math.round(r.width), h: Math.round(r.height), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0,30) });
    }
    if (small.length >= 10) break;
  }

  // --- unnamed controls ---
  const unnamed = [];
  for (const el of document.querySelectorAll('main button, main a[href], main [role="button"]')) {
    if (!visible(el)) continue;
    const txt = (el.textContent || '').trim();
    const lbl = el.getAttribute('aria-label') || el.getAttribute('title') || (el.getAttribute('aria-labelledby') ? 'labelledby' : '');
    if (!txt && !lbl) {
      unnamed.push({ k: key(el), html: el.outerHTML.slice(0,120) });
    }
    if (unnamed.length >= 8) break;
  }

  // --- form controls without labels ---
  const unlabeled = [];
  for (const el of document.querySelectorAll('main input:not([type=hidden]), main select, main textarea')) {
    if (!visible(el)) continue;
    const id = el.id;
    const hasLabel = (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) || el.closest('label') ||
      el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (!hasLabel) unlabeled.push({ k: key(el), type: el.getAttribute('type')||el.tagName, ph: el.getAttribute('placeholder')||'' });
    if (unlabeled.length >= 8) break;
  }

  // --- headings ---
  const headings = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')]
    .filter(visible).map(h => h.tagName + '|' + h.textContent.trim().slice(0,40));

  return {
    vw, docScrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth,
    horizOverflow: de.scrollWidth > de.clientWidth + 1,
    overflowers, xscroll, small, unnamed, unlabeled, headings,
  };
})()`;

test("employer ux probe", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleErrors.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${String(e).slice(0, 200)}`));

  await login(page);

  const report: Record<string, unknown> = {};
  for (const route of ROUTES) {
    const perRoute: Record<string, unknown> = {};
    await page.setViewportSize({ width: WIDTHS[0], height: 900 });
    try {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForTimeout(2500);
    } catch (e) {
      report[route] = { navError: String(e).slice(0, 200) };
      console.log("NAVFAIL", route);
      continue;
    }
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(700);
      try {
        perRoute[String(w)] = await page.evaluate(PROBE);
      } catch (e) {
        perRoute[String(w)] = { error: String(e).slice(0, 160) };
      }
    }
    report[route] = perRoute;
    console.log("done", route);
  }

  const out = path.join(process.cwd(), "..", "employer-probe.json");
  fs.writeFileSync(out, JSON.stringify({ report, consoleErrors: [...new Set(consoleErrors)] }, null, 1));
  expect(true).toBe(true);
});
