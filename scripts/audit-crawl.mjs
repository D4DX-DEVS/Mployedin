// One-shot production-readiness crawl. Enumerates EVERY page route from the
// filesystem, logs in as each role, and visits every route under that role's
// area (resolving [id]/[slug] detail pages from real in-page links). Records
// PASS/WARN/FAIL per page from HTTP status, runtime errors, redirects, and
// document-level horizontal overflow at the selected viewport.
// Run:
//   node scripts/audit-crawl.mjs
//   AUDIT_VIEWPORT=mobile node scripts/audit-crawl.mjs
//   BASE_URL=http://localhost:3001 AUDIT_VIEWPORT=mobile node scripts/audit-crawl.mjs
import { chromium } from "@playwright/test";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const VIEWPORT_NAME = process.env.AUDIT_VIEWPORT ?? "desktop";
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 700 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1366, height: 900 },
};
const VIEWPORT = VIEWPORTS[VIEWPORT_NAME];
if (!VIEWPORT) {
  throw new Error(`Unknown AUDIT_VIEWPORT "${VIEWPORT_NAME}". Use ${Object.keys(VIEWPORTS).join(", ")}.`);
}
const REQUESTED_GROUPS = process.env.AUDIT_GROUPS
  ? new Set(process.env.AUDIT_GROUPS.split(",").map((group) => group.trim()).filter(Boolean))
  : null;
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
  let status = 0, verdict = "PASS", notes = [], finalPath = path, links = [], layout = null;
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(600);
    finalPath = new URL(page.url()).pathname;
    // real runtime error = Next.js error overlay/dialog present
    const hasErrorOverlay = await page.locator("[data-nextjs-dialog], [data-nextjs-error]").count().catch(() => 0);

    if (finalPath.endsWith("/login") && !path.endsWith("/login")) { verdict = "FAIL"; notes.push("redirected to login"); }
    else if (!finalPath.startsWith(prefix) && !SHARED.includes(finalPath) && finalPath !== path) {
      verdict = "WARN"; notes.push(`redirected -> ${finalPath}`);
    }
    if (status >= 500) { verdict = "FAIL"; notes.push(`HTTP ${status}`); }
    else if (status >= 400) { verdict = (verdict === "FAIL" ? "FAIL" : "WARN"); notes.push(`HTTP ${status}`); }
    if (hasErrorOverlay) { verdict = "FAIL"; notes.push("nextjs error overlay"); }
    if (consoleErrors.length) { if (verdict === "PASS") verdict = "WARN"; notes.push(`${consoleErrors.length} console err`); }

    if (verdict !== "FAIL") {
      layout = await page.evaluate(() => {
        const viewportWidth = window.innerWidth;
        const documentWidth = Math.max(
          document.documentElement?.scrollWidth ?? 0,
          document.body?.scrollWidth ?? 0,
        );
        const dashboardMain = document.querySelector(".dashboard-main");
        const dashboardOverflowPixels = dashboardMain
          ? Math.max(0, dashboardMain.scrollWidth - dashboardMain.clientWidth)
          : 0;
        const documentOverflowPixels = Math.max(0, documentWidth - viewportWidth);
        const overflowPixels = Math.max(documentOverflowPixels, dashboardOverflowPixels);
        const offenders = overflowPixels > 1
          ? Array.from(document.querySelectorAll("body *"))
            .filter((element) => {
              const style = getComputedStyle(element);
              if (style.display === "none" || style.visibility === "hidden") return false;
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && (rect.right > viewportWidth + 1 || rect.left < -1);
            })
            .slice(0, 5)
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const name = element.tagName.toLowerCase();
              const id = element.id ? `#${element.id}` : "";
              const classes = typeof element.className === "string"
                ? element.className.trim().split(/\s+/).slice(0, 3).map((c) => `.${c}`).join("")
                : "";
              return `${name}${id}${classes} (${Math.round(rect.left)}..${Math.round(rect.right)})`;
            })
          : [];
        return {
          viewportWidth,
          documentWidth,
          documentOverflowPixels,
          dashboardWidth: dashboardMain?.clientWidth ?? null,
          dashboardScrollWidth: dashboardMain?.scrollWidth ?? null,
          dashboardOverflowPixels,
          overflowPixels,
          offenders,
        };
      });
      if (layout.overflowPixels > 1) {
        if (verdict === "PASS") verdict = "WARN";
        const source = layout.dashboardOverflowPixels >= layout.documentOverflowPixels
          ? "dashboard"
          : "document";
        notes.push(`${source} horizontal overflow +${layout.overflowPixels}px`);
      }
      links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")).filter(Boolean));
    }
  } catch (e) { verdict = "FAIL"; notes.push("nav error: " + String(e.message).slice(0, 90)); }
  page.off("console", onC); page.off("pageerror", onE);
  return { path, status, verdict, notes: notes.join("; "), consoleErrors: consoleErrors.slice(0, 2), layout, links };
}

function printResult(result) {
  process.stdout.write(
    `[${result.verdict}] ${result.path}${result.pattern ? " (" + result.pattern + ")" : ""} ${result.status} ${result.notes}\n`,
  );
}

async function crawlRole(browser, role) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
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
    printResult(res);
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
    printResult(res);
  }
  // report dynamic patterns we could not resolve (no link found)
  for (const d of dynamics) if (!usedPat.has(d.pat)) {
    const result = { path: d.pat, status: 0, verdict: "SKIP", notes: "no real id link found to test", consoleErrors: [] };
    results.push(result);
    printResult(result);
  }
  await logout(page);
  await ctx.close();
  return results;
}

async function crawlAnonymous(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const dashboardPrefixes = Object.values(ROLES).map((role) => role.prefix);
  const routes = allRoutes.filter((route) =>
    !dashboardPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
    && !SHARED.includes(route)
  );
  const statics = routes.filter((route) => !isDynamic(route));
  const dynamics = routes.filter(isDynamic).map((route) => ({ pat: route, re: dynToRe(route) }));
  const results = [];
  const visited = new Set();
  const concreteFound = new Set();

  for (const route of statics) {
    if (visited.has(route)) continue;
    visited.add(route);
    const result = await visit(page, "/", route);
    results.push(result);
    printResult(result);
    for (const href of result.links) {
      const path = href.startsWith("http")
        ? (href.startsWith(BASE) ? new URL(href).pathname : null)
        : (href.startsWith("/") ? href : null);
      if (!path) continue;
      for (const dynamic of dynamics) {
        if (dynamic.re.test(path)) concreteFound.add(`${path}||${dynamic.pat}`);
      }
    }
  }

  const usedPatterns = new Set();
  for (const entry of concreteFound) {
    const [path, pattern] = entry.split("||");
    if (usedPatterns.has(pattern)) continue;
    usedPatterns.add(pattern);
    const result = await visit(page, "/", path);
    result.pattern = pattern;
    results.push(result);
    printResult(result);
  }
  for (const dynamic of dynamics) {
    if (!usedPatterns.has(dynamic.pat)) {
      const result = { path: dynamic.pat, status: 0, verdict: "SKIP", notes: "no real id link found to test", consoleErrors: [], layout: null };
      results.push(result);
      printResult(result);
    }
  }
  await ctx.close();
  return results;
}

const browser = await chromium.launch();
const report = {};
if (!REQUESTED_GROUPS || REQUESTED_GROUPS.has("anonymous")) {
  process.stdout.write(`\n=== anonymous (${VIEWPORT_NAME} ${VIEWPORT.width}x${VIEWPORT.height}) ===\n`);
  report.anonymous = await crawlAnonymous(browser);
}
for (const role of Object.keys(ROLES)) {
  if (REQUESTED_GROUPS && !REQUESTED_GROUPS.has(role)) continue;
  process.stdout.write(`\n=== ${role} (${VIEWPORT_NAME} ${VIEWPORT.width}x${VIEWPORT.height}) ===\n`);
  report[role] = await crawlRole(browser, role);
}
await browser.close();
const groupSuffix = REQUESTED_GROUPS ? `-${[...REQUESTED_GROUPS].join("-")}` : "";
const reportPath = `audit-crawl-report-${VIEWPORT_NAME}${groupSuffix}.json`;
writeFileSync(reportPath, JSON.stringify({
  meta: { baseUrl: BASE, viewport: VIEWPORT_NAME, dimensions: VIEWPORT },
  ...report,
}, null, 2));
const flat = Object.values(report).flat();
const c = (v) => flat.filter((r) => r.verdict === v).length;
process.stdout.write(`\n\nREPORT=${reportPath} TOTAL=${flat.length} PASS=${c("PASS")} WARN=${c("WARN")} FAIL=${c("FAIL")} SKIP=${c("SKIP")}\n`);
