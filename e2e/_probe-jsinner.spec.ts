/* Temporary: measure the inner frame job-seeker wrapper routes add. Delete after audit. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const WIDTHS = [390, 768, 1024, 1440];
const ROUTES = ["/en/job-seeker/jobs", "/en/job-seeker/profile", "/en/job-seeker/settings",
                "/en/job-seeker/saved-jobs", "/en/job-seeker/companies", "/en/job-seeker/calendar",
                "/en/job-seeker", "/en/job-seeker/messages", "/en/job-seeker/experience"];

const PROBE = `(() => {
  const px=(v)=>Math.round(parseFloat(v)||0);
  const w=document.querySelector('.job-seeker-route-content');
  if(!w) return {noWrapper:true};
  const wcs=getComputedStyle(w), wr=w.getBoundingClientRect();
  const vis=(el)=>{const cs=getComputedStyle(el);if(cs.display==='none')return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0};
  const kid=[...w.children].filter(vis)[0];
  const k = kid ? (()=>{const cs=getComputedStyle(kid), r=kid.getBoundingClientRect();
    return {cls:(kid.className||'').toString().slice(0,90), padX:px(cs.paddingLeft), padY:px(cs.paddingTop),
      maxW:cs.maxWidth, width:Math.round(r.width), left:Math.round(r.left),
      gap:px(cs.rowGap), display:cs.display};})() : null;
  // content edge = left of first grandchild
  let contentLeft=null;
  if(kid){const g=[...kid.children].filter(vis)[0]; if(g) contentLeft=Math.round(g.getBoundingClientRect().left);}
  return {wrapPadX:px(wcs.paddingLeft), wrapPadY:px(wcs.paddingTop), wrapMaxW:wcs.maxWidth,
          wrapLeft:Math.round(wr.left), wrapWidth:Math.round(wr.width), kid:k, contentLeft};
})()`;

test("js inner frame", async ({ page }) => {
  test.setTimeout(25 * 60 * 1000);
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: /email address/i }).fill("jobseeker@mployedin.com");
  await page.getByLabel(/^Password$/i).fill("JobSeeker@1234");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/en\/job-seeker(\/|$)/, { timeout: 30_000 });

  const out: Record<string, unknown> = {};
  for (const r of ROUTES) {
    const per: Record<string, unknown> = {};
    await page.setViewportSize({ width: 390, height: 900 });
    try { await page.goto(r, { waitUntil: "domcontentloaded", timeout: 90_000 }); await page.waitForTimeout(2200); }
    catch (e) { out[r] = { navError: String(e).slice(0,100) }; continue; }
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(450);
      per[String(w)] = await page.evaluate(PROBE);
    }
    out[r] = per;
  }
  fs.writeFileSync(path.join(process.cwd(), "..", "js-inner.json"), JSON.stringify(out, null, 1));
  expect(true).toBe(true);
});
