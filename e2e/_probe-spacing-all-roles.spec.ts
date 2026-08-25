/* Temporary cross-role spacing probe. Delete after the audit. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const WIDTHS = [360, 375, 390, 430, 768, 900, 1024, 1280, 1440];

const ROLES: Record<string, { email: string; pass: string; landing: RegExp; routes: string[] }> = {
  employer: {
    email: "employer@mployedin.com", pass: "Employer@1234",
    landing: /\/en\/employer(\/|$)/,
    routes: ["/en/employer", "/en/employer/jobs", "/en/employer/candidates", "/en/employer/settings", "/en/employer/analytics"],
  },
  job_seeker: {
    email: "jobseeker@mployedin.com", pass: "JobSeeker@1234",
    landing: /\/en\/job-seeker(\/|$)/,
    routes: ["/en/job-seeker", "/en/job-seeker/jobs", "/en/job-seeker/applications", "/en/job-seeker/profile", "/en/job-seeker/settings"],
  },
  agent: {
    email: "agent@mployedin.com", pass: "Agent@1234",
    landing: /\/en\/agent(\/|$)/,
    routes: ["/en/agent", "/en/agent/job-seekers", "/en/agent/employers", "/en/agent/interviews", "/en/agent/commissions"],
  },
  super_agent: {
    email: "superagent@mployedin.com", pass: "SuperAgent@1234",
    landing: /\/en\/super-agent(\/|$)/,
    routes: ["/en/super-agent", "/en/super-agent/agents", "/en/super-agent/employers", "/en/super-agent/job-seekers"],
  },
  admin: {
    email: "admin@mployedin.com", pass: "Admin@1234",
    landing: /\/en\/admin(\/|$)/,
    routes: ["/en/admin", "/en/admin/users", "/en/admin/jobs", "/en/admin/employers", "/en/admin/settings/notifications"],
  },
};

const PROBE = `(() => {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const main = document.querySelector('main');
  const shell = document.querySelector('.dashboard-shell');
  const topbar = document.querySelector('.dashboard-topbar');
  const container = document.querySelector('main .page-container') || (main ? main.firstElementChild : null);

  const containerInfo = container ? (() => {
    const cs = getComputedStyle(container);
    return {
      cls: (container.className||'').toString().slice(0,60),
      isPageContainer: (container.className||'').toString().includes('page-container'),
      padTop: px(cs.paddingTop), padBottom: px(cs.paddingBottom), padX: px(cs.paddingLeft),
      gap: px(cs.rowGap), maxW: cs.maxWidth,
      width: Math.round(container.getBoundingClientRect().width),
    };
  })() : null;

  // section-to-section: measured gaps between consecutive top-level children
  const sectionGaps = [];
  if (container) {
    const kids = [...container.children].filter(vis);
    for (let i = 1; i < kids.length; i++) {
      const prev = kids[i-1].getBoundingClientRect();
      const cur = kids[i].getBoundingClientRect();
      sectionGaps.push(Math.round(cur.top - prev.bottom));
    }
  }

  const CARD_SEL = 'main .card-base, main .workspace-panel-surface, main .workspace-hero-surface, main section, main [class*="rounded-2xl"], main [class*="rounded-xl"], main [class*="rounded-3xl"]';
  const cards = [];
  for (const el of document.querySelectorAll(CARD_SEL)) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 140 || r.height < 48) continue;
    const hasSurface = cs.borderTopWidth !== '0px' || cs.boxShadow !== 'none';
    if (!hasSurface) continue;
    cards.push({ padY: px(cs.paddingTop), padX: px(cs.paddingLeft), radius: px(cs.borderTopLeftRadius) });
    if (cards.length >= 40) break;
  }

  // form rhythm: label->input and input->input
  const fieldGaps = [];
  const labels = [...document.querySelectorAll('main label')].filter(vis).slice(0, 12);
  for (const l of labels) {
    const host = l.parentElement;
    if (!host) continue;
    const ctrl = host.querySelector('input, select, textarea');
    if (!ctrl || !vis(ctrl)) continue;
    const lb = l.getBoundingClientRect(), cb = ctrl.getBoundingClientRect();
    if (cb.top >= lb.bottom) fieldGaps.push(Math.round(cb.top - lb.bottom));
  }

  // control heights
  const ctrlH = [];
  for (const el of document.querySelectorAll('main button, main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main select')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0) ctrlH.push(Math.round(r.height));
    if (ctrlH.length >= 25) break;
  }

  // table density
  const rows = [...document.querySelectorAll('main tbody tr')].filter(vis).slice(0, 8);
  const rowH = rows.map(r => Math.round(r.getBoundingClientRect().height));
  const firstCell = document.querySelector('main tbody td');
  const cellPad = firstCell ? (() => { const cs = getComputedStyle(firstCell); return px(cs.paddingTop)+'/'+px(cs.paddingLeft); })() : null;

  const heads = {};
  for (const t of ['H1','H2','H3']) {
    const el = [...document.querySelectorAll('main ' + t)].filter(vis)[0];
    if (el) heads[t] = px(getComputedStyle(el).fontSize);
  }

  return {
    containerInfo, sectionGaps, cards, fieldGaps, ctrlH, rowH, cellPad, heads,
    topbarH: topbar ? Math.round(topbar.getBoundingClientRect().height) : null,
    mainLeft: main ? Math.round(main.getBoundingClientRect().left) : null,
    shellCls: shell ? (shell.className||'').toString().slice(0,80) : null,
  };
})()`;

async function login(page: Page, email: string, pass: string, landing: RegExp) {
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: /email address/i }).fill(email);
  await page.getByLabel(/^Password$/i).fill(pass);
  await page.click("button[type=submit]");
  await page.waitForURL(landing, { timeout: 30_000 });
}

async function logout(page: Page) {
  await page.goto("/en/api/auth/signout").catch(() => {});
  await page.context().clearCookies();
}

test("cross-role spacing probe", async ({ page }) => {
  test.setTimeout(60 * 60 * 1000);
  const report: Record<string, unknown> = {};

  for (const [role, cfg] of Object.entries(ROLES)) {
    const roleOut: Record<string, unknown> = {};
    try {
      await logout(page);
      await login(page, cfg.email, cfg.pass, cfg.landing);
    } catch (e) {
      report[role] = { loginError: String(e).slice(0, 160) };
      console.log("LOGINFAIL", role);
      continue;
    }
    for (const route of cfg.routes) {
      const per: Record<string, unknown> = {};
      await page.setViewportSize({ width: WIDTHS[0], height: 900 });
      try {
        await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(2200);
      } catch (e) {
        roleOut[route] = { navError: String(e).slice(0, 140) };
        continue;
      }
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(500);
        try { per[String(w)] = await page.evaluate(PROBE); }
        catch (e) { per[String(w)] = { error: String(e).slice(0, 120) }; }
      }
      roleOut[route] = per;
      console.log("done", role, route);
    }
    report[role] = roleOut;
  }

  fs.writeFileSync(path.join(process.cwd(), "..", "spacing-all-roles.json"), JSON.stringify(report, null, 1));
  expect(true).toBe(true);
});
