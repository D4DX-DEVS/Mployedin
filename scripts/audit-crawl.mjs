// One-shot production-readiness crawl. Enumerates EVERY page route from the
// filesystem, logs in as each role, and visits every route under that role's
// area (resolving [id]/[slug] detail pages from real in-page links). Records
// PASS/WARN/FAIL per page from HTTP status, runtime errors, and redirects.
// Run: node scripts/audit-crawl.mjs   (dev server must be on :3000)
import { chromium } from "@playwright/test";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const ROLES = {
  admin:       { email: "admin@mployedin.com",      pw: "Admin@1234",      prefix: "/en/admin" },
  super_agent: { email: "superagent@mployedin.com", pw: "SuperAgent@1234", prefix: "/en/super-agent" },
  agent:       { email: "agent@mployedin.com",       pw: "Agent@1234",      prefix: "/en/agent" },
  employer:    { email: "employer@mployedin.com",    pw: "Employer@1234",   prefix: "/en/employer" },
  job_seeker:  { email: "jobseeker@mployedin.com",   pw: "JobSeeker@1234",  prefix: "/en/job-seeker" },
};
const SHARED = ["/en/profile", "/en/settings", "/en/notifications", "/en/account"];

// ── enumerate all page routes from src/app ──────────────────────────────────
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name === "page.tsx") out.push(p);
  }
  return out;
}
function toRoute(file) {
  const seg = file.replace(/\\/g, "/").replace(/^.*src\/app/, "").replace(/\/page\.tsx$/, "").split("/").filter(Boolean);
  const parts = [];
  for (let s of seg) {
    if (/^\(.*\)$/.test(s)) continue;        // route group
    if (s === "[locale]") { parts.push("en"); continue; }
    parts.push(s);
  }
  return "/" + parts.join("/");
}
const allRoutes = [...new Set(walk("src/app").map(toRoute))];
const isDynamic = (r) => /\[.*\]/.test(r);
const dynToRe = (r) => new RegExp("^" + r.replace(/\[[^\]]+\]/g, "[^/]+") + "$");

const routesFor = (prefix) => allRoutes.filter((r) => r.startsWith(prefix + "/") || r === prefix);

async function login(page, role) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE}/en/login`, { waitUntil: "networkidle" });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.fill('input[type="email"], input[placeholder="name@example.com"]', ROLES[role].email);
    await page.fill('input[type="password"]', ROLES[role].pw);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }).catch(() => {}),
      page.click('button:has-text("Sign in")'),
    ]);
    await page.waitForTimeout(1200);
    if (!new URL(page.url()).pathname.endsWith("/login")) return true;
    await page.waitForTimeout(1500); // brief backoff then retry
  }
  return false;
}
async function logout(page) {
  await page.goto(`${BASE}/api/auth/signout`, { waitUntil: "domcontentloaded" });
  await page.click('button:has-text("Sign out")').catch(() => {});
  await page.waitForTimeout(400);
}

async function visit(page, prefix, path) {
  const consoleErrors = [];
  const onC = (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 140)); };
  const onE = (e) => consoleErrors.push("PAGEERROR: " + String(e).slice(0, 140));
  page.on("console", onC); page.on("pageerror", onE);
  let status = 0, verdict = "PASS", notes = [], finalPath = path, links = [];
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(600);
    finalPath = new URL(page.url()).pathname;
    // real runtime error = Next.js error overlay/dialog present
    const hasErrorOverlay = await page.locator("nextjs-portal, [data-nextjs-dialog], [data-nextjs-error]").count().catch(() => 0);

    if (finalPath.endsWith("/login")) { verdict = "FAIL"; notes.push("redirected to login"); }
    else if (!finalPath.startsWith(prefix) && !SHARED.includes(finalPath) && finalPath !== path) {
      verdict = "WARN"; notes.push(`redirected -> ${finalPath}`);
    }
    if (status >= 500) { verdict = "FAIL"; notes.push(`HTTP ${status}`); }
    else if (status >= 400) { verdict = (verdict === "FAIL" ? "FAIL" : "WARN"); notes.push(`HTTP ${status}`); }
    if (hasErrorOverlay) { verdict = "FAIL"; notes.push("nextjs error overlay"); }
    if (consoleErrors.length) { if (verdict === "PASS") verdict = "WARN"; notes.push(`${consoleErrors.length} console err`); }

    if (verdict !== "FAIL") {
      links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")).filter(Boolean));
    }
  } catch (e) { verdict = "FAIL"; notes.push("nav error: " + String(e.message).slice(0, 90)); }
  page.off("console", onC); page.off("pageerror", onE);
  return { path, status, verdict, notes: notes.join("; "), consoleErrors: consoleErrors.slice(0, 2), links };
}

async function crawlRole(browser, role) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const ok = await login(page, role);
  const prefix = ROLES[role].prefix;
  const results = [];
  if (!ok) {
    results.push({ path: prefix, status: 0, verdict: "FAIL", notes: "LOGIN FAILED after 3 tries", consoleErrors: [] });
    await ctx.close();
    return results;
  }
  const roleRoutes = [...routesFor(prefix), ...SHARED];
  const statics = roleRoutes.filter((r) => !isDynamic(r));
  const dynamics = roleRoutes.filter(isDynamic).map((r) => ({ pat: r, re: dynToRe(r), done: false }));

  const visited = new Set();
  const concreteFound = new Set();
  // visit all static routes
  for (const r of statics) {
    if (visited.has(r)) continue; visited.add(r);
    const res = await visit(page, prefix, r);
    results.push(res);
    // harvest links to resolve dynamic detail pages with REAL ids
    for (const h of res.links) {
      const p = h.startsWith("http") ? (h.startsWith(BASE) ? new URL(h).pathname : null) : (h.startsWith("/") ? h : null);
      if (!p) continue;
      for (const d of dynamics) if (!d.done && d.re.test(p)) concreteFound.add(p + "||" + d.pat);
    }
  }
  // visit one concrete instance per dynamic pattern
  const usedPat = new Set();
  for (const cf of concreteFound) {
    const [p, pat] = cf.split("||");
    if (usedPat.has(pat)) continue; usedPat.add(pat);
    const res = await visit(page, prefix, p);
    res.pattern = pat;
    results.push(res);
  }
  // report dynamic patterns we could not resolve (no link found)
  for (const d of dynamics) if (!usedPat.has(d.pat)) {
    results.push({ path: d.pat, status: 0, verdict: "SKIP", notes: "no real id link found to test", consoleErrors: [] });
  }
  await logout(page);
  await ctx.close();
  return results;
}

const browser = await chromium.launch();
const report = {};
for (const role of Object.keys(ROLES)) {
  process.stdout.write(`\n=== ${role} ===\n`);
  const res = await crawlRole(browser, role);
  report[role] = res;
  for (const r of res) process.stdout.write(`[${r.verdict}] ${r.path}${r.pattern ? " (" + r.pattern + ")" : ""} ${r.status} ${r.notes}\n`);
}
await browser.close();
writeFileSync("audit-crawl-report.json", JSON.stringify(report, null, 2));
const flat = Object.values(report).flat();
const c = (v) => flat.filter((r) => r.verdict === v).length;
process.stdout.write(`\n\nTOTAL=${flat.length} PASS=${c("PASS")} WARN=${c("WARN")} FAIL=${c("FAIL")} SKIP=${c("SKIP")}\n`);
