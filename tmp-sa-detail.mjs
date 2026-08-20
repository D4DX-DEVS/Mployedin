import { chromium } from "playwright";
const OUT = process.env.OUT_DIR;
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await c.newPage();
await p.goto("http://localhost:3888/en/login", { waitUntil: "networkidle" });
await p.fill("#email", "superagent@mployedin.com");
await p.fill("#password", "SuperAgent@1234");
await Promise.all([p.waitForURL((u)=>!u.pathname.includes("/login"),{timeout:90000}).catch(()=>{}), p.click('button[type="submit"]')]);
await p.goto("http://localhost:3888/en/super-agent/agents", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
const href = await p.evaluate(() => document.querySelector('table tbody tr') ? null : null);
await p.locator('table tbody tr').first().click();
await p.waitForTimeout(4000);
console.log("url", p.url());
const over = await p.evaluate(() => {
  const bad = [];
  document.querySelectorAll("body *").forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > window.innerWidth + 1)) {
      bad.push({ tag: el.tagName, cls: (el.className||"").toString().slice(0,90), right: Math.round(r.right), w: Math.round(r.width) });
    }
  });
  return { scrollW: document.documentElement.scrollWidth, inner: window.innerWidth, bad: bad.slice(0, 12) };
});
console.log(JSON.stringify(over, null, 1));
await p.screenshot({ path: `${OUT}/detail.png`, fullPage: false });
await b.close();
