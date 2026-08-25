/* Temporary: pin down 3 specific spacing anomalies. Delete after audit. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

async function login(page: Page, email: string, pass: string, landing: RegExp) {
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: /email address/i }).fill(email);
  await page.getByLabel(/^Password$/i).fill(pass);
  await page.click("button[type=submit]");
  await page.waitForURL(landing, { timeout: 30_000 });
}

const KIDS = `(() => {
  const px=(v)=>Math.round(parseFloat(v)||0);
  const f=document.querySelector('main .page-container')||document.querySelector('.job-seeker-route-content');
  if(!f) return null;
  const vis=(el)=>{const cs=getComputedStyle(el);if(cs.display==='none')return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0};
  const kids=[...f.children].filter(vis);
  return kids.map((el,i)=>{
    const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
    const prev=i>0?kids[i-1].getBoundingClientRect():null;
    return {i, tag:el.tagName, cls:(el.className||'').toString().slice(0,70),
      mt:px(cs.marginTop), mb:px(cs.marginBottom),
      gapBefore: prev?Math.round(r.top-prev.bottom):null};
  });
})()`;

const ASYM = `(() => {
  const px=(v)=>Math.round(parseFloat(v)||0);
  const out=[];
  for(const el of document.querySelectorAll('main div, main section, main aside')){
    const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
    if(r.width<160||r.height<56) continue;
    const pl=px(cs.paddingLeft), pr=px(cs.paddingRight), pt=px(cs.paddingTop);
    if(Math.abs(pl-pr)>=4) out.push({pad:pt+'/'+pl+'-'+pr, cls:(el.className||'').toString().slice(0,80)});
    if(out.length>=12) break;
  }
  return out;
})()`;

const FIELD = `(() => {
  const px=(v)=>Math.round(parseFloat(v)||0);
  const out=[];
  for(const l of [...document.querySelectorAll('main label')].slice(0,12)){
    const host=l.parentElement; if(!host) continue;
    const c=host.querySelector('input:not([type=hidden]),select,textarea'); if(!c) continue;
    const lb=l.getBoundingClientRect(), cb=c.getBoundingClientRect();
    if(cb.top<lb.bottom-1) continue;
    const hcs=getComputedStyle(host);
    out.push({gap:Math.round(cb.top-lb.bottom), hostCls:(host.className||'').toString().slice(0,60), hostGap:px(hcs.rowGap), lMb:px(getComputedStyle(l).marginBottom)});
  }
  return out;
})()`;

test("pin anomalies", async ({ page }) => {
  test.setTimeout(15 * 60 * 1000);
  const out: Record<string, unknown> = {};
  await page.setViewportSize({ width: 1440, height: 900 });

  await login(page, "employer@mployedin.com", "Employer@1234", /\/en\/employer(\/|$)/);
  await page.goto("/en/employer/jobs", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  out["employer/jobs@1440 children"] = await page.evaluate(KIDS);

  await page.goto("/en/api/auth/signout").catch(() => {});
  await page.context().clearCookies();
  await login(page, "jobseeker@mployedin.com", "JobSeeker@1234", /\/en\/job-seeker(\/|$)/);
  for (const r of ["/en/job-seeker/profile", "/en/job-seeker/settings"]) {
    await page.goto(r, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    out[r + " asymPad@1440"] = await page.evaluate(ASYM);
    out[r + " fields@1440"] = await page.evaluate(FIELD);
    out[r + " children@1440"] = await page.evaluate(KIDS);
  }
  fs.writeFileSync(path.join(process.cwd(), "..", "pin.json"), JSON.stringify(out, null, 1));
  expect(true).toBe(true);
});
