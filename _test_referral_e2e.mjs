/**
 * E2E test: Create referral link → register employers → verify tracking
 * Run: node _test_referral_e2e.mjs
 */

const BASE = "http://localhost:3000";

// Cookie jar helper
function extractCookies(res, existing = "") {
  const setCookies = res.headers.getSetCookie?.() || [];
  const map = {};
  // Parse existing cookies
  if (existing) {
    existing.split("; ").forEach((c) => {
      const [k, ...v] = c.split("=");
      if (k) map[k] = v.join("=");
    });
  }
  // Merge new cookies
  setCookies.forEach((raw) => {
    const cookiePart = raw.split(";")[0];
    const [k, ...v] = cookiePart.split("=");
    if (k) map[k.trim()] = v.join("=");
  });
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(email, password) {
  // Step 1: Get CSRF token
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  let cookies = extractCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();

  // Step 2: POST credentials
  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    redirect: "false",
    json: "true",
  });

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
    body: body.toString(),
    redirect: "manual",
  });
  cookies = extractCookies(loginRes, cookies);

  // Step 3: Follow redirect to set session cookie
  const location = loginRes.headers.get("location");
  if (location) {
    const redirectUrl = location.startsWith("http") ? location : `${BASE}${location}`;
    const followRes = await fetch(redirectUrl, {
      headers: { Cookie: cookies },
      redirect: "manual",
    });
    cookies = extractCookies(followRes, cookies);
  }

  // Step 4: Verify session
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: cookies },
  });
  cookies = extractCookies(sessionRes, cookies);
  const session = await sessionRes.json();

  return { cookies, session };
}

async function testReferralFlow() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  REFERRAL LINK E2E VERIFICATION");
  console.log("═══════════════════════════════════════════════════\n");

  // Step 1: Login as agent
  console.log("▶ Step 1: Logging in as agent...");
  let auth;
  try {
    auth = await login("agent@mployedin.com", "Agent@1234");
    if (!auth.session?.user) throw new Error("No session");
    console.log(`  ✓ Logged in as: ${auth.session.user.name} (${auth.session.user.email}), role: ${auth.session.user.role}\n`);
  } catch {
    console.log("  ✗ agent@test.com failed. Trying admin login...");
    try {
      auth = await login("admin@mployedin.com", "Admin@1234");
      if (!auth.session?.user) throw new Error("No session");
      console.log(`  ✓ Logged in as: ${auth.session.user.name} (${auth.session.user.email}), role: ${auth.session.user.role}\n`);
    } catch (e2) {
      console.log(`  ✗ Admin login also failed. Cannot proceed.`);
      console.log(`  Hint: Check your agent/admin user credentials.\n`);
      return;
    }
  }

  // Step 2: Get/create referral link
  console.log("▶ Step 2: Getting referral link via /api/referral...");
  const refRes = await fetch(`${BASE}/api/referral`, {
    headers: { Cookie: auth.cookies },
  });
  const refData = await refRes.json();
  console.log(`  Status: ${refRes.status}`);
  if (!refRes.ok) {
    console.log(`  Error: ${refData.error}`);
    console.log(`  Role: ${auth.session.user.role} — needs agent or super_agent role`);
    console.log("  Trying with the known code MPL-A133DABB...\n");
  } else {
    console.log(`  Code: ${refData.referralCode}`);
    console.log(`  Link: ${refData.referralLink}`);
    console.log(`  Active: ${refData.isActive}`);
    console.log(`  Used: ${refData.usedCount}`);
    console.log(`  Registrations: ${refData.registrations?.length ?? 0}`);
  }

  const referralCode = refData.referralCode || "MPL-A133DABB";
  console.log(`  Using code: ${referralCode}\n`);

  // Step 3: Validate the code
  console.log("▶ Step 3: Validating referral code...");
  const valRes = await fetch(`${BASE}/api/referral/validate?code=${referralCode}`);
  const valData = await valRes.json();
  console.log(`  Valid: ${valData.valid}, Referrer: ${valData.referrerName} (${valData.referrerType})\n`);

  // Step 4: Register 3 employers
  const ts = Date.now();
  const testEmployers = [
    { companyName: "Test Corp Alpha", contactName: "Alice Test", contactEmail: `alice-${ts}@test.com`, contactPhone: "+971501111111", password: "TestPass123!", industry: "Technology", country: "UAE", city: "Dubai" },
    { companyName: "Beta Industries", contactName: "Bob Test", contactEmail: `bob-${ts}@test.com`, contactPhone: "+971502222222", password: "TestPass123!", industry: "Finance", country: "UAE", city: "Abu Dhabi" },
    { companyName: "Gamma Solutions", contactName: "Charlie Test", contactEmail: `charlie-${ts}@test.com`, contactPhone: "+966501111111", password: "TestPass123!", industry: "Healthcare", country: "SA", city: "Riyadh" },
  ];

  console.log("▶ Step 4: Registering 3 employers with referral code...");
  let successCount = 0;
  for (const emp of testEmployers) {
    const form = new FormData();
    form.append("companyName", emp.companyName);
    form.append("contactName", emp.contactName);
    form.append("contactEmail", emp.contactEmail);
    form.append("contactPhone", emp.contactPhone);
    form.append("password", emp.password);
    form.append("industry", emp.industry);
    form.append("country", emp.country);
    form.append("city", emp.city);
    form.append("referralCode", referralCode);
    form.append("size", "10-50");
    form.append("verificationLevel", "basic");

    const res = await fetch(`${BASE}/api/auth/employer-register`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    const ok = res.status === 201 || res.status === 200;
    if (ok) successCount++;
    console.log(`  ${ok ? "✓" : "✗"} ${emp.companyName}: ${res.status} — ${data.message || data.error || JSON.stringify(data).slice(0, 80)}`);
  }
  console.log(`  Registered: ${successCount}/3\n`);

  // Step 5: Check referral link data
  console.log("▶ Step 5: Checking referral data after registrations...");
  const checkRes = await fetch(`${BASE}/api/referral`, {
    headers: { Cookie: auth.cookies },
  });
  if (checkRes.ok) {
    const d = await checkRes.json();
    console.log(`  Code: ${d.referralCode}`);
    console.log(`  Active: ${d.isActive}`);
    console.log(`  Used Count: ${d.usedCount}`);
    console.log(`  Registrations: ${d.registrations?.length ?? 0}`);
    if (d.registrations?.length > 0) {
      d.registrations.forEach((r, i) => {
        console.log(`    ${i + 1}. ${r.companyName} (${r.email}) — ${r.city || ""}, ${r.country || ""} — ${new Date(r.registeredAt).toLocaleString()}`);
      });
    }
    console.log();

    // Step 6: Check /api/referral-links
    console.log("▶ Step 6: Checking /api/referral-links page endpoint...");
    const listRes = await fetch(`${BASE}/api/referral-links?page=1&limit=10`, {
      headers: { Cookie: auth.cookies },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      console.log(`  Total links: ${listData.total}`);
      console.log(`  Stats: ${JSON.stringify(listData.stats)}`);
      listData.links?.forEach((link) => {
        console.log(`  ─ ${link.code} | "${link.label || ""}" | Active:${link.isActive} | Used:${link.usedCount} | Regs:${link.registrations?.length ?? 0}`);
        link.registrations?.forEach((r, i) => {
          console.log(`      ${i + 1}. ${r.companyName} (${r.email})`);
        });
      });
    } else {
      console.log(`  ✗ Status: ${listRes.status}`);
    }
    console.log();

    // Summary
    console.log("═══════════════════════════════════════════════════");
    console.log("  RESULTS SUMMARY");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Employers registered: ${successCount}/3`);
    console.log(`  Registrations tracked: ${d.registrations?.length ?? 0}`);
    console.log(`  Used count: ${d.usedCount}`);
    console.log(`  Link active: ${d.isActive}`);
    console.log(`  Match: ${successCount === (d.registrations?.length ?? 0) ? "✓ PASS" : "✗ MISMATCH"}`);
    console.log("═══════════════════════════════════════════════════\n");
  } else {
    console.log(`  ✗ Cannot check — status ${checkRes.status}\n`);
  }
}

testReferralFlow().catch((e) => {
  console.error("Script failed:", e.message);
  process.exit(1);
});

