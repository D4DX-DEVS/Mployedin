import { chromium } from "playwright";
const OUT = process.env.OUT_DIR;
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await c.newPage();
await p.goto("http://localhost:3888/en/login", { waitUntil: "networkidle" });
await p.fill("#email", "superagent@mployedin.com");
await p.fill("#password", "SuperAgent@1234");
await Promise.all([
  p.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 90000 }).catch(() => {}),
  p.click('button[type="submit"]'),
]);
await p.waitForTimeout(3000);
console.log("after login:", p.url());
const err = await p.locator('[role="alert"], .text-destructive').allTextContents().catch(() => []);
if (err.length) console.log("errors:", err.join(" | "));
for (const [name, url] of [["dash","/en/super-agent"],["agents","/en/super-agent/agents"],["leads","/en/super-agent/leads"],["commissions","/en/super-agent/commissions"]]) {
  await p.goto("http://localhost:3888" + url, { waitUntil: "networkidle", timeout: 90000 }).catch(()=>{});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, p.url());
}
await b.close();
