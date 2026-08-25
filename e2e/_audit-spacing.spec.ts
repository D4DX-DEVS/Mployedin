/* Temporary: broad cross-role spacing AUDIT. Delete after the audit. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const WIDTHS = [360, 390, 430, 768, 900, 1024, 1280, 1440];

const ROLES: Record<string, { email: string; pass: string; landing: RegExp; routes: string[] }> = {
  employer: {
    email: "employer@mployedin.com", pass: "Employer@1234", landing: /\/en\/employer(\/|$)/,
    routes: ["/en/employer", "/en/employer/jobs", "/en/employer/candidates", "/en/employer/applications",
             "/en/employer/interviews", "/en/employer/offers", "/en/employer/analytics", "/en/employer/settings",
             "/en/employer/team", "/en/employer/invoices", "/en/employer/workflow", "/en/employer/subscription"],
  },
  job_seeker: {
    email: "jobseeker@mployedin.com", pass: "JobSeeker@1234", landing: /\/en\/job-seeker(\/|$)/,
    routes: ["/en/job-seeker", "/en/job-seeker/jobs", "/en/job-seeker/applications", "/en/job-seeker/profile",
             "/en/job-seeker/settings", "/en/job-seeker/saved-jobs", "/en/job-seeker/companies",
             "/en/job-seeker/messages", "/en/job-seeker/calendar", "/en/job-seeker/experience"],
  },
  agent: {
    email: "agent@mployedin.com", pass: "Agent@1234", landing: /\/en\/agent(\/|$)/,
    routes: ["/en/agent", "/en/agent/job-seekers", "/en/agent/employers", "/en/agent/interviews",
             "/en/agent/commissions", "/en/agent/invoices", "/en/agent/candidates", "/en/agent/exhibitions"],
  },
  super_agent: {
    email: "superagent@mployedin.com", pass: "SuperAgent@1234", landing: /\/en\/super-agent(\/|$)/,
    routes: ["/en/super-agent", "/en/super-agent/agents", "/en/super-agent/employers",
             "/en/super-agent/job-seekers", "/en/super-agent/commissions", "/en/super-agent/invoices"],
  },
  admin: {
    email: "admin@mployedin.com", pass: "Admin@1234", landing: /\/en\/admin(\/|$)/,
    routes: ["/en/admin", "/en/admin/users", "/en/admin/jobs", "/en/admin/employers", "/en/admin/job-seekers",
             "/en/admin/applications", "/en/admin/invoices", "/en/admin/agents", "/en/admin/audit-logs",
             "/en/admin/subscriptions"],
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
  const frame = document.querySelector('main .page-container') || document.querySelector('.job-seeker-route-content');
  const frameInfo = frame ? (() => { const cs = getComputedStyle(frame); return {
    padX: px(cs.paddingLeft), padTop: px(cs.paddingTop), padBottom: px(cs.paddingBottom),
    gap: px(cs.rowGap), maxW: cs.maxWidth, width: Math.round(frame.getBoundingClientRect().width),
    isPageContainer: (frame.className||'').toString().includes('page-container'),
  }; })() : null;

  // section rhythm between top-level children of the frame
  const sectionGaps = [];
  if (frame) {
    const kids = [...frame.children].filter(vis);
    for (let i = 1; i < kids.length; i++) {
      const p = kids[i-1].getBoundingClientRect(), c = kids[i].getBoundingClientRect();
      const g = Math.round(c.top - p.bottom);
      if (g >= 0 && g < 200) sectionGaps.push(g);
    }
  }

  // card surfaces
  const cards = [];
  for (const el of document.querySelectorAll('main div, main section, main article, main aside')) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 56) continue;
    const hasBorder = cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none';
    const hasShadow = cs.boxShadow !== 'none';
    const rad = px(cs.borderTopLeftRadius);
    if (!(hasBorder || hasShadow) || rad === 0) continue;
    cards.push({ padY: px(cs.paddingTop), padX: px(cs.paddingLeft), radius: rad });
    if (cards.length >= 50) break;
  }

  // form rhythm
  const fieldGaps = [], inputGaps = [];
  const labels = [...document.querySelectorAll('main label')].filter(vis).slice(0, 15);
  for (const l of labels) {
    const host = l.parentElement; if (!host) continue;
    const ctrl = host.querySelector('input:not([type=hidden]), select, textarea');
    if (!ctrl || !vis(ctrl)) continue;
    const lb = l.getBoundingClientRect(), cb = ctrl.getBoundingClientRect();
    if (cb.top >= lb.bottom - 1) fieldGaps.push(Math.round(cb.top - lb.bottom));
  }
  const ctrls = [...document.querySelectorAll('main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main select, main textarea')].filter(vis).slice(0, 12);
  for (let i = 1; i < ctrls.length; i++) {
    const a = ctrls[i-1].getBoundingClientRect(), b = ctrls[i].getBoundingClientRect();
    const g = Math.round(b.top - a.bottom);
    if (g > 0 && g < 120) inputGaps.push(g);
  }

  // controls
  const btnH = [], inpH = [];
  for (const el of document.querySelectorAll('main button')) { if (!vis(el)) continue; btnH.push(Math.round(el.getBoundingClientRect().height)); if (btnH.length>=20) break; }
  for (const el of document.querySelectorAll('main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main select')) { if (!vis(el)) continue; inpH.push(Math.round(el.getBoundingClientRect().height)); if (inpH.length>=12) break; }

  // table density
  const rows = [...document.querySelectorAll('main tbody tr')].filter(vis).slice(0, 10);
  const rowH = rows.map(r => Math.round(r.getBoundingClientRect().height));
  const td = document.querySelector('main tbody td');
  const th = document.querySelector('main thead th');
  const cellPad = td ? (() => { const cs = getComputedStyle(td); return px(cs.paddingTop)+'/'+px(cs.paddingLeft); })() : null;
  const headH = th ? Math.round(th.getBoundingClientRect().height) : null;

  // typography
  const heads = {};
  for (const t of ['H1','H2','H3']) {
    const el = [...document.querySelectorAll('main ' + t)].filter(vis)[0];
    if (el) { const cs = getComputedStyle(el); heads[t] = { size: px(cs.fontSize), mb: px(cs.marginBottom) }; }
  }

  return { frameInfo, sectionGaps, cards, fieldGaps, inputGaps, btnH, inpH, rowH, cellPad, headH, heads,
           mainLeft: main ? Math.round(main.getBoundingClientRect().left) : null };
})()`;

async function login(page: Page, email: string, pass: string, landing: RegExp) {
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: /email address/i }).fill(email);
  await page.getByLabel(/^Password$/i).fill(pass);
  await page.click("button[type=submit]");
  await page.waitForURL(landing, { timeout: 30_000 });
}

test("cross-role spacing audit", async ({ page }) => {
  test.setTimeout(90 * 60 * 1000);
  const report: Record<string, unknown> = {};
  for (const [role, cfg] of Object.entries(ROLES)) {
    const out: Record<string, unknown> = {};
    try {
      await page.goto("/en/api/auth/signout").catch(() => {});
      await page.context().clearCookies();
      await login(page, cfg.email, cfg.pass, cfg.landing);
    } catch (e) { report[role] = { loginError: String(e).slice(0,150) }; continue; }
    for (const route of cfg.routes) {
      const per: Record<string, unknown> = {};
      await page.setViewportSize({ width: WIDTHS[0], height: 900 });
      try {
        await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await page.waitForTimeout(2000);
      } catch (e) { out[route] = { navError: String(e).slice(0,120) }; continue; }
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(450);
        try { per[String(w)] = await page.evaluate(PROBE); } catch (e) { per[String(w)] = { error: String(e).slice(0,100) }; }
      }
      out[route] = per;
      console.log("done", role, route);
    }
    report[role] = out;
  }
  fs.writeFileSync(path.join(process.cwd(), "..", "spacing-audit.json"), JSON.stringify(report, null, 1));
  expect(true).toBe(true);
});
