/**
 * E2E Test — Invoice Generation & Commission Assignment Flow
 *
 * Tests the full cycle:
 *   1. Admin creates a recruitment invoice for an employer (whose job is under agent + super-agent)
 *   2. Employer sends payment notification
 *   3. Admin verifies payment (marks as paid)
 *   4. Commissions are auto-created and approved for agent + super-agent
 *   5. Commissions appear in super-agent and agent reports
 *
 * Prerequisites:
 *   - App running on localhost:3000
 *   - Kerala seed data present (run: node --env-file=.env scripts/seed-kerala-team.mjs)
 *   - SEED_ADMIN_PASSWORD set in the environment
 *
 * Usage:
 *   node --env-file=.env scripts/test-invoice-commission-e2e.mjs
 */

import mongoose from "mongoose";

const BASE = "http://localhost:3000";
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

if (!MONGODB_URI || !ADMIN_PASSWORD) {
  console.error("❌ MONGODB_URI and SEED_ADMIN_PASSWORD must be set.");
  process.exit(1);
}

// ─── Cookie / Auth helpers ───────────────────────────────────────────────────

function extractCookies(res, existing = "") {
  const setCookies = res.headers.getSetCookie?.() || [];
  const map = {};
  if (existing) existing.split("; ").forEach((c) => { const [k, ...v] = c.split("="); if (k) map[k] = v.join("="); });
  setCookies.forEach((raw) => { const cp = raw.split(";")[0]; const [k, ...v] = cp.split("="); if (k) map[k.trim()] = v.join("="); });
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(email, password) {
  // First, hit a page to get CSRF cookie set by middleware
  const pageRes = await fetch(`${BASE}/en/login`, { redirect: "manual" });
  let cookies = extractCookies(pageRes);

  // If redirect, follow it to get more cookies
  const pageLoc = pageRes.headers.get("location");
  if (pageLoc) {
    const r2 = await fetch(pageLoc.startsWith("http") ? pageLoc : BASE + pageLoc, { headers: { Cookie: cookies }, redirect: "manual" });
    cookies = extractCookies(r2, cookies);
  }

  // Get CSRF token - try API first, then extract from authjs cookie
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: cookies } });
  cookies = extractCookies(csrfRes, cookies);
  let csrfToken;
  try {
    const csrfJson = await csrfRes.json();
    csrfToken = csrfJson.csrfToken;
  } catch { /* empty */ }

  // Fallback: extract from authjs.csrf-token cookie (format: token|hash)
  if (!csrfToken) {
    const authCsrfMatch = cookies.match(/authjs\.csrf-token=([^|;]+)/);
    if (authCsrfMatch) {
      csrfToken = decodeURIComponent(authCsrfMatch[1]);
    }
  }

  if (!csrfToken) {
    console.warn("  ⚠️  Could not obtain NextAuth CSRF token, login may fail");
  }

  const body = new URLSearchParams({ csrfToken: csrfToken || "", email, password, redirect: "false", json: "true" });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
    body: body.toString(),
    redirect: "manual",
  });
  cookies = extractCookies(loginRes, cookies);
  const loc = loginRes.headers.get("location");
  if (loc) {
    const r = await fetch(loc.startsWith("http") ? loc : BASE + loc, { headers: { Cookie: cookies }, redirect: "manual" });
    cookies = extractCookies(r, cookies);
  }
  const sessRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookies } });
  cookies = extractCookies(sessRes, cookies);
  let session = {};
  try { session = await sessRes.json(); } catch { session = {}; }

  // Ensure we have a CSRF cookie for mutating requests
  if (!getCsrfTokenFromCookies(cookies)) {
    // Visit a dashboard page to trigger middleware to set csrf-token cookie
    const dashRes = await fetch(`${BASE}/en`, { headers: { Cookie: cookies }, redirect: "manual" });
    cookies = extractCookies(dashRes, cookies);
  }

  return { cookies, session };
}

function getCsrfTokenFromCookies(cookies) {
  const match = cookies.match(/csrf-token=([^;]+)/);
  return match ? match[1] : null;
}

async function ensureCsrfCookie(cookies) {
  // If we already have a csrf-token cookie, return as is
  if (getCsrfTokenFromCookies(cookies)) return cookies;
  // Hit multiple pages to get the CSRF cookie set
  const pages = ["/en", "/en/login", "/en/admin"];
  for (const page of pages) {
    const res = await fetch(`${BASE}${page}`, { headers: { Cookie: cookies }, redirect: "manual" });
    cookies = extractCookies(res, cookies);
    if (getCsrfTokenFromCookies(cookies)) break;
    // Follow redirect if any
    const loc = res.headers.get("location");
    if (loc) {
      const r2 = await fetch(loc.startsWith("http") ? loc : BASE + loc, { headers: { Cookie: cookies }, redirect: "manual" });
      cookies = extractCookies(r2, cookies);
      if (getCsrfTokenFromCookies(cookies)) break;
    }
  }
  // If still no CSRF token, generate our own (the middleware compares cookie to header)
  if (!getCsrfTokenFromCookies(cookies)) {
    const token = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    cookies = cookies ? `${cookies}; csrf-token=${token}` : `csrf-token=${token}`;
  }
  return cookies;
}

async function api(method, path, cookies, body = null) {
  // Ensure CSRF cookie exists for mutating requests
  if (method !== "GET") {
    cookies = await ensureCsrfCookie(cookies);
  }
  const csrfToken = getCsrfTokenFromCookies(cookies);
  const opts = { method, headers: { Cookie: cookies } };
  if (csrfToken && method !== "GET") {
    opts.headers["x-csrf-token"] = csrfToken;
  }
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, cookies: extractCookies(res, cookies) };
}

// ─── Results tracking ────────────────────────────────────────────────────────

let pass = 0, fail = 0;
function check(label, condition, detail = "") {
  if (condition) { console.log(`  ✅ ${label}`); pass++; }
  else { console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`); fail++; }
}

// ─── Main Test Suite ─────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  INVOICE → PAYMENT → COMMISSION E2E VERIFICATION");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Connect to DB to look up IDs
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // ── Resolve test entities from Kerala seed data ──────────────────────────

  // Employer: TechPark Kochi → Agent: Deepa Rajan → Super Agent: Rajesh Kumar
  const adminUser = await db.collection("users").findOne({ email: "admin@mployedin.com" });
  const employerUser = await db.collection("users").findOne({ email: "hr@techparkkochi.com" });
  const agentUser = await db.collection("users").findOne({ email: "deepa.agent@mployedin.com" });
  const superAgentUser = await db.collection("users").findOne({ email: "rajesh.sa@mployedin.com" });

  if (!adminUser || !employerUser || !agentUser || !superAgentUser) {
    console.error("❌ Missing seed data. Run: node --env-file=.env scripts/seed-kerala-team.mjs");
    console.error("   Also ensure admin exists: node --env-file=.env scripts/create-admin.mjs");
    await mongoose.disconnect();
    process.exit(1);
  }

  const employer = await db.collection("employers").findOne({ userId: employerUser._id });
  const agent = await db.collection("agents").findOne({ userId: agentUser._id });
  const superAgent = await db.collection("superagents").findOne({ userId: superAgentUser._id });

  if (!employer || !agent || !superAgent) {
    console.error("❌ Missing employer/agent/super-agent profiles.");
    await mongoose.disconnect();
    process.exit(1);
  }

  // Find a job under this employer+agent
  const job = await db.collection("jobs").findOne({ employerId: employer._id, agentId: agent._id, status: "active" });
  if (!job) {
    console.error("❌ No active job found for employer+agent. Run seed first.");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`📋 Test Setup:`);
  console.log(`   Employer : ${employer.companyName} (${employerUser.email})`);
  console.log(`   Agent    : ${agentUser.name} — commission: ${agent.commissionRate}%`);
  console.log(`   SA       : ${superAgentUser.name} — override: ${superAgent.overrideRate}%`);
  console.log(`   Job      : ${job.title} (ID: ${job._id})`);
  console.log();

  // Clean up any existing test invoices for this job
  await db.collection("invoices").deleteMany({
    jobId: job._id,
    employerId: employer._id,
    category: "recruitment",
  });
  await db.collection("commissions").deleteMany({
    $or: [
      { agentId: agent._id },
      { superAgentId: superAgent._id },
    ],
    notes: /E2E test|Auto-generated from approved invoice/,
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: Admin creates invoice → commissions are embedded + external records created
  // ══════════════════════════════════════════════════════════════════════════

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("▶ TEST 1: Admin creates recruitment invoice (issued)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const adminAuth = await login("admin@mployedin.com", ADMIN_PASSWORD);
  check("Admin login successful", adminAuth.session?.user?.role === "admin", `got: ${adminAuth.session?.user?.role}`);

  const invoicePayload = {
    jobId: job._id.toString(),
    employerId: employer._id.toString(),
    amount: 50000,
    currency: "INR",
    lineItems: [
      { description: `Recruitment fee — ${job.title} (E2E test)`, quantity: 1, unitPrice: 50000, amount: 50000 },
    ],
    taxType: "gst",
    taxPercent: 18,
    discountPercent: 0,
    paymentTerms: "net_30",
    status: "issued",
    notes: "E2E test invoice",
    internalNotes: "Created by E2E test script",
  };

  const createRes = await api("POST", "/api/invoices/recruitment", adminAuth.cookies, invoicePayload);
  check("Invoice creation returns 201", createRes.status === 201, `status: ${createRes.status}, error: ${createRes.data?.error}`);

  if (createRes.status !== 201) {
    console.error("\n⚠️  Invoice creation failed. Cannot proceed.\n", createRes.data);
    await mongoose.disconnect();
    process.exit(1);
  }

  const invoice = createRes.data.invoice;
  const invoiceId = invoice._id;
  console.log(`   Invoice #: ${invoice.invoiceNumber}`);
  console.log(`   Total: INR ${invoice.totalAmount} (subtotal: ${invoice.subtotal}, tax: ${invoice.taxAmount})`);

  check("Invoice status is 'issued'", invoice.status === "issued");
  check("Invoice has embedded commissions", invoice.commissions?.length >= 2, `got: ${invoice.commissions?.length}`);

  const agentComm = invoice.commissions?.find(c => c.role === "agent");
  const saComm = invoice.commissions?.find(c => c.role === "super_agent");

  check("Agent commission embedded", !!agentComm, JSON.stringify(agentComm));
  check("SA commission embedded", !!saComm, JSON.stringify(saComm));

  if (agentComm) {
    const expectedAgentAmount = Math.round((invoice.totalAmount * agent.commissionRate) / 100 * 100) / 100;
    check(`Agent rate = ${agent.commissionRate}%`, agentComm.rate === agent.commissionRate, `got: ${agentComm.rate}`);
    check(`Agent commission amount = INR ${expectedAgentAmount}`, agentComm.amount === expectedAgentAmount, `got: ${agentComm.amount}`);
  }

  if (saComm) {
    const expectedSAAmount = Math.round((invoice.totalAmount * superAgent.overrideRate) / 100 * 100) / 100;
    check(`SA rate = ${superAgent.overrideRate}%`, saComm.rate === superAgent.overrideRate, `got: ${saComm.rate}`);
    check(`SA commission amount = INR ${expectedSAAmount}`, saComm.amount === expectedSAAmount, `got: ${saComm.amount}`);
  }

  // Check external Commission records were created (since status=issued)
  check("External commission records created", createRes.data.commissions?.length >= 2, `got: ${createRes.data.commissions?.length}`);

  const externalCommissions = await db.collection("commissions").find({ invoiceId: new mongoose.Types.ObjectId(invoiceId) }).toArray();
  check("DB: Commission records exist", externalCommissions.length >= 2, `found: ${externalCommissions.length}`);

  const dbAgentComm = externalCommissions.find(c => c.type === "placement");
  const dbSAComm = externalCommissions.find(c => c.type === "override");
  check("DB: Agent commission status = pending", dbAgentComm?.status === "pending", `got: ${dbAgentComm?.status}`);
  check("DB: SA commission status = pending", dbSAComm?.status === "pending", `got: ${dbSAComm?.status}`);

  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: Employer sends payment notification → Admin verifies → Invoice paid → Commissions approved
  // ══════════════════════════════════════════════════════════════════════════

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("▶ TEST 2: Employer notifies payment → Admin verifies → Commissions approved");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // First, admin marks the invoice as "sent" so employer can interact
  const deliverySent = await api("POST", `/api/invoices/${invoiceId}/delivery`, adminAuth.cookies, { action: "sent" });
  check("Invoice marked as sent", deliverySent.status === 200, `status: ${deliverySent.status}`);

  // Login as employer
  const employerAuth = await login("hr@techparkkochi.com", "Kerala@1234");
  check("Employer login successful", employerAuth.session?.user?.role === "employer", `got: ${employerAuth.session?.user?.role}`);

  // Employer sends payment notification
  const payNotify = await api("POST", `/api/invoices/${invoiceId}/delivery`, employerAuth.cookies, {
    action: "payment_notification",
    paymentMethod: "bank_transfer",
    referenceNumber: "E2E-TXN-2026-001",
    notes: "Paid via NEFT — E2E test",
  });
  check("Employer payment notification sent", payNotify.status === 200, `status: ${payNotify.status}, error: ${payNotify.data?.error}`);

  // Admin verifies payment
  const verifyRes = await api("POST", `/api/invoices/${invoiceId}/verify-payment`, adminAuth.cookies, {
    notificationIndex: 0,
    action: "approve",
    notes: "Verified via E2E test",
  });
  check("Admin verifies payment successfully", verifyRes.status === 200, `status: ${verifyRes.status}, error: ${verifyRes.data?.error}`);
  check("Invoice status is now 'paid'", verifyRes.data?.invoiceStatus === "paid", `got: ${verifyRes.data?.invoiceStatus}`);

  // Verify commissions are now approved
  const commissionsAfterPaid = await db.collection("commissions").find({ invoiceId: new mongoose.Types.ObjectId(invoiceId) }).toArray();
  const agentCommAfterPaid = commissionsAfterPaid.find(c => c.type === "placement");
  const saCommAfterPaid = commissionsAfterPaid.find(c => c.type === "override");

  check("Agent commission status = approved", agentCommAfterPaid?.status === "approved", `got: ${agentCommAfterPaid?.status}`);
  check("SA commission status = approved", saCommAfterPaid?.status === "approved", `got: ${saCommAfterPaid?.status}`);
  check("Agent commission has approvedBy", !!agentCommAfterPaid?.approvedBy);
  check("SA commission has approvedAt", !!saCommAfterPaid?.approvedAt);

  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: Verify commissions appear in SA + Agent reports
  // ══════════════════════════════════════════════════════════════════════════

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("▶ TEST 3: Commission reports for Super-Agent and Agent");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Login as Super Agent
  const saAuth = await login("rajesh.sa@mployedin.com", "Kerala@1234");
  check("Super-agent login successful", saAuth.session?.user?.role === "super_agent", `got: ${saAuth.session?.user?.role}`);

  // Check SA commissions report
  const saReport = await api("GET", `/api/super-agent/commissions-report?year=${new Date().getFullYear()}`, saAuth.cookies);
  check("SA commission report loads", saReport.status === 200, `status: ${saReport.status}`);

  if (saReport.status === 200) {
    const summary = saReport.data.overviewSummary;
    check("SA overrideTotal > 0", summary?.overrideTotal > 0, `overrideTotal: ${summary?.overrideTotal}`);
    check("SA grandTotal > 0", summary?.grandTotal > 0, `grandTotal: ${summary?.grandTotal}`);
    check("SA teamTotal > 0", summary?.teamTotal > 0, `teamTotal: ${summary?.teamTotal}`);

    // Check agent breakdown includes Deepa Rajan
    const deepaRow = saReport.data.agentBreakdown?.find(a => a.agentEmail === "deepa.agent@mployedin.com" || a.agentName === "Deepa Rajan");
    check("SA report includes agent Deepa Rajan", !!deepaRow, `breakdown: ${saReport.data.agentBreakdown?.map(a => a.agentName).join(", ")}`);
    if (deepaRow) {
      check("Agent's commission shows in SA breakdown", deepaRow.total > 0, `total: ${deepaRow.total}`);
    }
  }

  // Check SA invoices list shows this invoice
  const saInvoices = await api("GET", `/api/invoices?status=paid`, saAuth.cookies);
  check("SA can see paid invoices", saInvoices.status === 200);
  const saInvoiceFound = saInvoices.data?.invoices?.find(i => i._id === invoiceId);
  check("SA sees the test invoice in list", !!saInvoiceFound, `invoice count: ${saInvoices.data?.invoices?.length}`);

  // Login as Agent
  const agentAuth = await login("deepa.agent@mployedin.com", "Kerala@1234");
  check("Agent login successful", agentAuth.session?.user?.role === "agent", `got: ${agentAuth.session?.user?.role}`);

  // Check agent can see their commissions
  const agentCommissions = await api("GET", `/api/commissions?status=approved`, agentAuth.cookies);
  check("Agent commission API loads", agentCommissions.status === 200, `status: ${agentCommissions.status}`);

  if (agentCommissions.status === 200) {
    const myComm = agentCommissions.data?.commissions?.find(
      c => c.invoiceId?.toString() === invoiceId || c.invoiceId === invoiceId
    );
    check("Agent sees their commission for this invoice", !!myComm, `commissions: ${agentCommissions.data?.commissions?.length}`);
    if (myComm) {
      check("Agent commission amount matches", myComm.amount === agentCommAfterPaid?.amount, `expected: ${agentCommAfterPaid?.amount}, got: ${myComm.amount}`);
      check("Agent commission status = approved", myComm.status === "approved");
    }
  }

  // Agent can see invoices
  const agentInvoices = await api("GET", `/api/invoices?status=paid`, agentAuth.cookies);
  check("Agent can see paid invoices", agentInvoices.status === 200);
  const agentInvoiceFound = agentInvoices.data?.invoices?.find(i => i._id === invoiceId);
  check("Agent sees the test invoice", !!agentInvoiceFound);

  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // BONUS TEST: Admin records direct payment (alternative flow)
  // ══════════════════════════════════════════════════════════════════════════

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("▶ TEST 4 (BONUS): Admin direct payment on a second invoice");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Find a second job under same team
  const job2 = await db.collection("jobs").findOne({
    employerId: employer._id,
    agentId: agent._id,
    status: "active",
    _id: { $ne: job._id },
  });

  if (job2) {
    // Clean up
    await db.collection("invoices").deleteMany({ jobId: job2._id, employerId: employer._id, category: "recruitment" });

    // Create second invoice
    const invoice2Res = await api("POST", "/api/invoices/recruitment", adminAuth.cookies, {
      jobId: job2._id.toString(),
      employerId: employer._id.toString(),
      amount: 75000,
      currency: "INR",
      lineItems: [{ description: `Recruitment fee — ${job2.title} (E2E test 2)`, quantity: 1, unitPrice: 75000, amount: 75000 }],
      taxType: "gst",
      taxPercent: 18,
      discountPercent: 5,
      paymentTerms: "net_15",
      status: "issued",
      notes: "E2E test invoice #2 — direct payment",
    });
    check("Second invoice created", invoice2Res.status === 201, `status: ${invoice2Res.status}, error: ${invoice2Res.data?.error}`);

    if (invoice2Res.status === 201) {
      const inv2 = invoice2Res.data.invoice;
      const inv2Id = inv2._id;
      console.log(`   Invoice #: ${inv2.invoiceNumber}, Total: INR ${inv2.totalAmount}`);

      // Admin records payment directly
      const payRes = await api("POST", `/api/invoices/${inv2Id}/payments`, adminAuth.cookies, {
        amount: inv2.totalAmount,
        paymentMethod: "bank_transfer",
        paymentDate: new Date().toISOString(),
        referenceNumber: "E2E-DIRECT-PAY-002",
        notes: "Direct payment recorded by admin — E2E test",
      });
      check("Direct payment recorded", payRes.status === 200 || payRes.status === 201, `status: ${payRes.status}, error: ${payRes.data?.error}`);

      // Check invoice is now paid
      const inv2Detail = await api("GET", `/api/invoices/${inv2Id}`, adminAuth.cookies);
      check("Invoice 2 is now paid", inv2Detail.data?.invoice?.status === "paid", `got: ${inv2Detail.data?.invoice?.status}`);

      // Check commissions for second invoice
      const comms2 = await db.collection("commissions").find({ invoiceId: new mongoose.Types.ObjectId(inv2Id) }).toArray();
      const agentComm2 = comms2.find(c => c.type === "placement");
      const saComm2 = comms2.find(c => c.type === "override");

      check("Invoice 2: Agent commission exists", !!agentComm2);
      check("Invoice 2: SA commission exists", !!saComm2);
      check("Invoice 2: Agent commission approved", agentComm2?.status === "approved", `got: ${agentComm2?.status}`);
      check("Invoice 2: SA commission approved", saComm2?.status === "approved", `got: ${saComm2?.status}`);

      if (agentComm2) {
        const expectedAmt = Math.round((inv2.totalAmount * agent.commissionRate) / 100 * 100) / 100;
        check(`Invoice 2: Agent amount = INR ${expectedAmt}`, agentComm2.amount === expectedAmt, `got: ${agentComm2.amount}`);
      }
      if (saComm2) {
        const expectedAmt = Math.round((inv2.totalAmount * superAgent.overrideRate) / 100 * 100) / 100;
        check(`Invoice 2: SA amount = INR ${expectedAmt}`, saComm2.amount === expectedAmt, `got: ${saComm2.amount}`);
      }

      // Verify in SA report
      const saReport2 = await api("GET", `/api/super-agent/commissions-report?year=${new Date().getFullYear()}`, saAuth.cookies);
      if (saReport2.status === 200) {
        check("SA report reflects both invoices", saReport2.data.overviewSummary?.grandTotal > saReport.data?.overviewSummary?.grandTotal,
          `before: ${saReport.data?.overviewSummary?.grandTotal}, after: ${saReport2.data.overviewSummary?.grandTotal}`);
      }
    }
  } else {
    console.log("  ⚠️  No second job found — skipping bonus test\n");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${pass} passed, ${fail} failed, ${pass + fail} total`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (fail > 0) {
    console.log("⚠️  Some tests failed. Review the output above for details.\n");
  } else {
    console.log("🎉 All tests passed! Invoice → Payment → Commission flow works end-to-end.\n");
  }

  await mongoose.disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("💥 Unhandled error:", err);
  mongoose.disconnect();
  process.exit(1);
});
