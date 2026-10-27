import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "fs";

const screenshotDir = "./screenshots_verify";
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const BASE_URL = "http://localhost:3888";

// Login credentials
const ADMIN_EMAIL = "admin@mployedin.com";
const ADMIN_PASS = "Admin@1234";
const SA_EMAIL = "superagent@mployedin.com";
const SA_PASS = "SuperAgent@1234";
const AGENT_EMAIL = "agent@mployedin.com";
const AGENT_PASS = "Agent@1234";

async function loginAsAdmin(page) {
  console.log("Logging in as admin...");
  try {
    await page.goto(`${BASE_URL}/en/login`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector("#email", { timeout: 10000 });
    await page.waitForTimeout(2500);
    await page.fill("#email", ADMIN_EMAIL);
    await page.fill("#password", ADMIN_PASS);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await page.waitForURL(/\/en\/admin/, { timeout: 90000 });
    console.log("Admin login successful");
    return true;
  } catch (e) {
    console.error("Admin login failed:", e.message);
    return false;
  }
}

async function loginAsSuperAgent(page) {
  console.log("Logging in as super agent...");
  try {
    await page.goto(`${BASE_URL}/en/login`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector("#email", { timeout: 10000 });
    await page.waitForTimeout(2500);
    await page.fill("#email", SA_EMAIL);
    await page.fill("#password", SA_PASS);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await page.waitForURL(/\/en\/super-agent/, { timeout: 90000 });
    console.log("Super agent login successful");
    return true;
  } catch (e) {
    console.error("Super agent login failed:", e.message);
    return false;
  }
}

async function loginAsAgent(page) {
  console.log("Logging in as agent...");
  try {
    await page.goto(`${BASE_URL}/en/login`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector("#email", { timeout: 10000 });
    await page.waitForTimeout(2500);
    await page.fill("#email", AGENT_EMAIL);
    await page.fill("#password", AGENT_PASS);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await page.waitForURL(/\/en\/agent/, { timeout: 90000 });
    console.log("Agent login successful");
    return true;
  } catch (e) {
    console.error("Agent login failed:", e.message);
    return false;
  }
}

async function takeScreenshot(page, name) {
  const p = `${screenshotDir}/${name}.png`;
  await page.screenshot({ path: p });
  console.log(`Screenshot: ${name}.png`);
  return p;
}

async function test1_AdminAssignAgents(page) {
  console.log("\n=== TEST 1: Admin assign agents ===");
  if (!await loginAsAdmin(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/admin/users`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "01_admin_users");

    const text = await page.innerText();
    const hasAgent = /agent|super/i.test(text);
    return { has_user_management: hasAgent };
  } catch (e) {
    return { error: e.message };
  }
}

async function test2_AdminAddAgentLocationPicker(page) {
  console.log("\n=== TEST 2: Admin add agent location picker ===");
  if (!await loginAsAdmin(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/admin/agents/add`, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "02_admin_add_agent");

    // Check for location/city field
    const locators = [
      'input[placeholder*="location"]',
      'input[placeholder*="city"]',
      'input[placeholder*="area"]',
      '[role="combobox"]'
    ];

    for (const loc of locators) {
      const el = page.locator(loc).first();
      if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log("Found location field:", loc);
        return { has_location_picker: true, selector: loc };
      }
    }

    return { has_location_picker: false };
  } catch (e) {
    return { error: e.message };
  }
}

async function test3_AdminActiveJobsFilter(page) {
  console.log("\n=== TEST 3: Admin active jobs filter ===");
  if (!await loginAsAdmin(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/admin/jobs`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, "03_admin_jobs");

    const text = await page.innerText();
    const hasActiveJobs = /active jobs|applications/i.test(text);

    if (hasActiveJobs) {
      // Try clicking on jobs with no applications
      const cards = page.locator('[role="button"], .card, .tile').all();
      for (const card of await cards) {
        const txt = await card.innerText().catch(() => "");
        if (/no applications|0 applications/i.test(txt)) {
          await card.click();
          await page.waitForTimeout(2000);
          await takeScreenshot(page, "03_jobs_filtered");
          const url = page.url();
          return { clicked: true, url: url };
        }
      }
    }

    return { has_jobs_card: hasActiveJobs };
  } catch (e) {
    return { error: e.message };
  }
}

async function test4_SAFollowUpTasks(page) {
  console.log("\n=== TEST 4: Super agent follow-up tasks ===");
  if (!await loginAsSuperAgent(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/super-agent`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, "04_sa_dashboard");

    const text = await page.innerText();
    const hasTaskOption = /task|agent|assign/i.test(text);

    return { has_task_option: hasTaskOption };
  } catch (e) {
    return { error: e.message };
  }
}

async function test5_SAReferralLink(page) {
  console.log("\n=== TEST 5: Super agent referral link ===");
  if (!await loginAsSuperAgent(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/super-agent`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(3000);

    const text = await page.innerText();
    const hasReferralLink = /referral link|share link/i.test(text);

    if (!hasReferralLink) {
      // Check in buttons/menus
      const buttons = page.locator('button, a, [role="button"]');
      const allText = await buttons.allInnerTexts();
      const hasReferral = allText.some(t => /referral|share|link/i.test(t));
      return { has_referral_link: hasReferral };
    }

    await takeScreenshot(page, "05_sa_referral");
    return { has_referral_link: hasReferralLink };
  } catch (e) {
    return { error: e.message };
  }
}

async function test6_SAMessageAgents(page) {
  console.log("\n=== TEST 6: Super agent message agents ===");
  if (!await loginAsSuperAgent(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/super-agent/agents`, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "06_sa_agents");

    const text = await page.innerText();
    const hasMessageOption = /message|communicate|send message/i.test(text);

    return { has_message_option: hasMessageOption };
  } catch (e) {
    return { error: e.message };
  }
}

async function test7_SALocations(page) {
  console.log("\n=== TEST 7: Super agent locations ===");
  if (!await loginAsSuperAgent(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/super-agent`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(3000);

    const text = await page.innerText();
    const hasCountries = /Qatar|Oman|Egypt|country|region/i.test(text);

    await takeScreenshot(page, "07_sa_locations");
    return { shows_countries: hasCountries, sample: text.substring(0, 150) };
  } catch (e) {
    return { error: e.message };
  }
}

async function test8_SAActiveAgents(page) {
  console.log("\n=== TEST 8: Super agent active agents list ===");
  if (!await loginAsSuperAgent(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/super-agent/agents`, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "08_sa_agents_list");

    const text = await page.innerText();
    const hasLocation = /location|region|area|managing/i.test(text);

    return { shows_agent_locations: hasLocation };
  } catch (e) {
    return { error: e.message };
  }
}

async function test11_AgentExhibitionSupport(page) {
  console.log("\n=== TEST 11: Agent exhibition support field ===");
  if (!await loginAsAgent(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/agent/exhibitions`, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "11_agent_exhibitions");

    const text = await page.innerText();
    const hasExhibitions = /exhibition|event/i.test(text);

    if (hasExhibitions) {
      // Look for support field or suggestions
      const supportField = /support|inventory|TV|Rollup|volunteer/i.test(text);
      return { has_exhibitions: true, has_support_field: supportField };
    }

    return { has_exhibitions: false };
  } catch (e) {
    return { error: e.message };
  }
}

async function test19_AgentResourceDownload(page) {
  console.log("\n=== TEST 19: Agent resource download ===");
  if (!await loginAsAgent(page)) return { error: "Login failed" };

  try {
    await page.goto(`${BASE_URL}/en/agent/resources`, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "19_agent_resources");

    const text = await page.innerText();
    const hasResources = /resource|download|file|document/i.test(text);

    return { has_resources: hasResources };
  } catch (e) {
    return { error: e.message };
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {};

  results.test1 = await test1_AdminAssignAgents(page);
  results.test2 = await test2_AdminAddAgentLocationPicker(page);
  results.test3 = await test3_AdminActiveJobsFilter(page);
  results.test4 = await test4_SAFollowUpTasks(page);
  results.test5 = await test5_SAReferralLink(page);
  results.test6 = await test6_SAMessageAgents(page);
  results.test7 = await test7_SALocations(page);
  results.test8 = await test8_SAActiveAgents(page);
  results.test11 = await test11_AgentExhibitionSupport(page);
  results.test19 = await test19_AgentResourceDownload(page);

  await browser.close();

  console.log("\n=== FINAL RESULTS ===");
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync("test_results.json", JSON.stringify(results, null, 2));
  console.log("Results saved to test_results.json");
}

run().catch(console.error);
