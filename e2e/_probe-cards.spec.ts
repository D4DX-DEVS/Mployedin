/* Temporary: identify which elements produce off-token card padding. Delete after audit. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROLES: Record<string, { email: string; pass: string; landing: RegExp; routes: string[] }> = {
  employer: { email: "employer@mployedin.com", pass: "Employer@1234", landing: /\/en\/employer(\/|$)/,
    routes: ["/en/employer", "/en/employer/jobs", "/en/employer/candidates", "/en/employer/analytics",
             "/en/employer/settings", "/en/employer/interviews", "/en/employer/offers", "/en/employer/subscription"] },
  super_agent: { email: "superagent@mployedin.com", pass: "SuperAgent@1234", landing: /\/en\/super-agent(\/|$)/,
    routes: ["/en/super-agent", "/en/super-agent/agents", "/en/super-agent/employers", "/en/super-agent/invoices"] },
  admin: { email: "admin@mployedin.com", pass: "Admin@1234", landing: /\/en\/admin(\/|$)/,
    routes: ["/en/admin", "/en/admin/users", "/en/admin/jobs", "/en/admin/invoices"] },
};

const PROBE = `(() => {
  const px=(v)=>Math.round(parseFloat(v)||0);
  const out=[];
  for(const el of document.querySelectorAll('main div, main section, main article, main aside, main li')){
    const cs=getComputedStyle(el);
    if(cs.display==='none') continue;
    const r=el.getBoundingClientRect();
    if(r.width<160||r.height<56) continue;
    const hasBorder=cs.borderTopWidth!=='0px'&&cs.borderTopStyle!=='none';
    if(!(hasBorder||cs.boxShadow!=='none')) continue;
    if(px(cs.borderTopLeftRadius)===0) continue;
    const pad=px(cs.paddingTop)+'/'+px(cs.paddingLeft);
    if(pad==='0/0') continue;
    out.push({pad, cls:(el.className||'').toString().replace(/\s+/g,' ').slice(0,110)});
    if(out.length>=60) break;
  }
  return out;
})()`;

async function login(page: Page, email: string, pass: string, landing: RegExp) {
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: /email address/i }).fill(email);
  await page.getByLabel(/^Password$/i).fill(pass);
  await page.click("button[type=submit]");
  await page.waitForURL(landing, { timeout: 30_000 });
}

test("card owners", async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);
  const out: Record<string, unknown> = {};
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [role, cfg] of Object.entries(ROLES)) {
    await page.goto("/en/api/auth/signout").catch(() => {});
    await page.context().clearCookies();
    await login(page, cfg.email, cfg.pass, cfg.landing);
    for (const r of cfg.routes) {
      try { await page.goto(r, { waitUntil: "domcontentloaded", timeout: 90_000 }); await page.waitForTimeout(2500); }
      catch { out[role + " " + r] = "navError"; continue; }
      out[role + " " + r] = await page.evaluate(PROBE);
    }
  }
  fs.writeFileSync(path.join(process.cwd(), "..", "cards.json"), JSON.stringify(out, null, 1));
  expect(true).toBe(true);
});
