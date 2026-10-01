/**
 * Region-visibility QA seed.
 *
 * Seeds super agents, agents and employers in UAE regions nobody else uses, so
 * "which employers does each super agent / agent see" can be checked against a
 * known answer (getSuperAgentBook / getAgentEmployerIds in
 * src/lib/auth/agentRestrictions.ts).
 *
 *   Super agents (4)
 *     sa1  Sharjah city              team: ag1, ag2
 *     sa2  Sharjah city (same as sa1) team: ag3
 *     sa3  Abu Dhabi city            team: ag4, ag5
 *     sa4  Sharjah (whole emirate), no team
 *
 *   Employers (10)
 *     e1-e3  Sharjah city
 *     e4-e5  Abu Dhabi city
 *     e6     Ajman (no super agent covers it)
 *     e7-e8  no region
 *     e9     no region, assigned to ag1 (both ends of the link)
 *     e10    Khor Fakkan (Sharjah, a different city)
 *
 * Every account: <key>@regionqa.test / RegionQa@1234
 *
 * NOTE: .env points at the shared staging database — these accounts appear
 * there. Remove them with --delete when done.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-region-visibility.mjs           (reset + seed)
 *   node --env-file=.env scripts/seed-region-visibility.mjs --delete  (remove only)
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run: node --env-file=.env scripts/seed-region-visibility.mjs");
  process.exit(1);
}

const DOMAIN = "regionqa.test";
const PASSWORD = "RegionQa@1234";
const TERMS_BASELINE_VERSION = "2026-09-29"; // src/lib/gdpr/termsVersion.ts

// Names after scripts/fix-location-data.mjs; the older catalogue names still resolve.
const CITY = {
  sharjah: { state: "Sharjah", city: "Sharjah" },
  khorFakkan: { state: "Sharjah", city: "Khor Fakkan" },
  abuDhabi: { state: "Abu Dhabi", city: "Abu Dhabi" },
  ajman: { state: "Ajman", city: "Ajman" },
};
const OLD_NAMES = {
  "Sharjah": "Sharjah Emirate",
  "Abu Dhabi": "Abu Dhabi Emirate",
  "Ajman": "Ajman Emirate",
};
const OLD_CITY_NAMES = { "Abu Dhabi": "Abu Dhabi Municipality", "Ajman": "Ajman City" };
const anyName = (name, old) => ({ $in: [name, ...(old[name] ? [old[name]] : [])] });

const SUPER_AGENTS = [
  { key: "sa1", name: "RQA SA Sharjah One", cities: ["sharjah"], states: [] },
  { key: "sa2", name: "RQA SA Sharjah Two", cities: ["sharjah"], states: [] },
  { key: "sa3", name: "RQA SA Abu Dhabi", cities: ["abuDhabi"], states: [] },
  { key: "sa4", name: "RQA SA Sharjah State", cities: [], states: ["Sharjah"] },
];

const AGENTS = [
  { key: "ag1", name: "RQA Agent Sharjah 1", sa: "sa1", cities: ["sharjah"] },
  { key: "ag2", name: "RQA Agent Sharjah 2", sa: "sa1", cities: ["sharjah"] },
  { key: "ag3", name: "RQA Agent Sharjah 3", sa: "sa2", cities: ["sharjah"] },
  { key: "ag4", name: "RQA Agent Abu Dhabi 4", sa: "sa3", cities: ["abuDhabi"] },
  { key: "ag5", name: "RQA Agent Abu Dhabi 5", sa: "sa3", cities: ["abuDhabi"] },
];

const EMPLOYERS = [
  { key: "e1", company: "RQA Sharjah Co 1", region: "sharjah" },
  { key: "e2", company: "RQA Sharjah Co 2", region: "sharjah" },
  { key: "e3", company: "RQA Sharjah Co 3", region: "sharjah" },
  { key: "e4", company: "RQA Abu Dhabi Co 4", region: "abuDhabi" },
  { key: "e5", company: "RQA Abu Dhabi Co 5", region: "abuDhabi" },
  { key: "e6", company: "RQA Ajman Uncovered Co 6", region: "ajman" },
  { key: "e7", company: "RQA No Region Co 7", region: null },
  { key: "e8", company: "RQA No Region Co 8", region: null },
  { key: "e9", company: "RQA No Region Assigned Co 9", region: null, agent: "ag1" },
  { key: "e10", company: "RQA Khor Fakkan Co 10", region: "khorFakkan" },
];

/** Who should see what, per the rules in agentRestrictions.ts. */
export const EXPECTED = {
  sa1: ["e1", "e2", "e3", "e9"],
  sa2: ["e1", "e2", "e3"],
  sa3: ["e4", "e5"],
  sa4: ["e1", "e2", "e3", "e10"],
  ag1: ["e1", "e2", "e3", "e9"],
  ag2: ["e1", "e2", "e3"],
  ag3: ["e1", "e2", "e3"],
  ag4: ["e4", "e5"],
  ag5: ["e4", "e5"],
};

const email = (key) => `${key}@${DOMAIN}`;

async function removeSeed(db) {
  const users = await db.collection("users").find({ email: { $regex: `@${DOMAIN.replace(".", "\\.")}$` } }).project({ _id: 1 }).toArray();
  const userIds = users.map((u) => u._id);
  if (userIds.length === 0) return 0;
  const [agents, superAgents, employers] = await Promise.all([
    db.collection("agents").find({ userId: { $in: userIds } }).project({ _id: 1 }).toArray(),
    db.collection("superagents").find({ userId: { $in: userIds } }).project({ _id: 1 }).toArray(),
    db.collection("employers").find({ userId: { $in: userIds } }).project({ _id: 1 }).toArray(),
  ]);
  const agentIds = agents.map((a) => a._id);
  const employerIds = employers.map((e) => e._id);
  // Unlink from anything outside the seed before deleting.
  await db.collection("superagents").updateMany({ agentIds: { $in: agentIds } }, { $pull: { agentIds: { $in: agentIds } } });
  await db.collection("agents").updateMany({ assignedEmployerIds: { $in: employerIds } }, { $pull: { assignedEmployerIds: { $in: employerIds } } });
  await Promise.all([
    db.collection("jobs").deleteMany({ employerId: { $in: employerIds } }),
    db.collection("subscriptions").deleteMany({ userId: { $in: userIds } }),
    db.collection("notifications").deleteMany({ userId: { $in: userIds } }),
    db.collection("agents").deleteMany({ _id: { $in: agentIds } }),
    db.collection("superagents").deleteMany({ _id: { $in: superAgents.map((s) => s._id) } }),
    db.collection("employers").deleteMany({ _id: { $in: employerIds } }),
  ]);
  await db.collection("users").deleteMany({ _id: { $in: userIds } });
  return userIds.length;
}

async function resolveCities(db) {
  const out = {};
  for (const [key, { state, city }] of Object.entries(CITY)) {
    const stateDoc = await db.collection("states").findOne({ name: anyName(state, OLD_NAMES) });
    if (!stateDoc) throw new Error(`State not in catalogue: ${state}`);
    const cityDoc = await db.collection("cities").findOne({ name: anyName(city, OLD_CITY_NAMES), stateId: stateDoc._id });
    if (!cityDoc) throw new Error(`City not in catalogue: ${city} (${state})`);
    out[key] = { cityId: cityDoc._id, stateId: stateDoc._id, label: `${city}, ${state}` };
  }
  return out;
}

async function stateIdByName(db, name) {
  const doc = await db.collection("states").findOne({ name: anyName(name, OLD_NAMES) });
  if (!doc) throw new Error(`State not in catalogue: ${name}`);
  return doc._id;
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const removed = await removeSeed(db);
  if (removed) console.log(`Removed ${removed} previous region-QA users and their profiles.`);
  if (process.argv.includes("--delete")) {
    await mongoose.disconnect();
    return;
  }

  const settings = await db.collection("systemsettings").findOne({}, { projection: { legalTermsVersion: 1 } });
  const termsVersion = settings?.legalTermsVersion || TERMS_BASELINE_VERSION;
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const cities = await resolveCities(db);
  const now = new Date();

  async function createUser(key, name, role) {
    const { insertedId } = await db.collection("users").insertOne({
      name,
      email: email(key),
      passwordHash,
      role,
      permissionMode: "role_default",
      locale: "en",
      isActive: true,
      isEmailVerified: true,
      termsAcceptedVersion: termsVersion,
      termsAcceptedAt: now,
      authProvider: "credentials",
      failedLoginAttempts: 0,
      passwordResetAttempts: 0,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    });
    return insertedId;
  }

  const staffDefaults = {
    roleArchivedAt: null,
    country: "AE",
    currencyCode: "AED",
    timezone: "Asia/Dubai",
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    createdAt: now,
    updatedAt: now,
  };

  // Super agents first: agents point at their profile ids.
  const saIds = {};
  for (const sa of SUPER_AGENTS) {
    const userId = await createUser(sa.key, sa.name, "super_agent");
    const stateIds = await Promise.all(sa.states.map((s) => stateIdByName(db, s)));
    const { insertedId } = await db.collection("superagents").insertOne({
      userId,
      assignedCityIds: sa.cities.map((c) => cities[c].cityId),
      assignedStateIds: stateIds,
      agentIds: [],
      commissions: { total: 0, pending: 0, paid: 0 },
      overrideRate: 0,
      defaultAgentCommissionRate: 0,
      ...staffDefaults,
    });
    saIds[sa.key] = insertedId;
  }

  const agentIds = {};
  for (const ag of AGENTS) {
    const userId = await createUser(ag.key, ag.name, "agent");
    const { insertedId } = await db.collection("agents").insertOne({
      userId,
      superAgentId: saIds[ag.sa],
      assignedCityIds: ag.cities.map((c) => cities[c].cityId),
      assignedStateIds: [],
      assignedEmployerIds: [],
      assignedJobSeekerIds: [],
      commissionRate: 0,
      ...staffDefaults,
    });
    agentIds[ag.key] = insertedId;
    await db.collection("superagents").updateOne({ _id: saIds[ag.sa] }, { $addToSet: { agentIds: insertedId } });
  }

  const employerIds = {};
  for (const emp of EMPLOYERS) {
    const userId = await createUser(emp.key, `${emp.company} Owner`, "employer");
    const region = emp.region ? cities[emp.region] : null;
    const { insertedId } = await db.collection("employers").insertOne({
      userId,
      ...(emp.agent ? { agentId: agentIds[emp.agent] } : {}),
      roleArchivedAt: null,
      companyName: emp.company,
      companyEmail: email(emp.key),
      phone: "+971500000000",
      address: region ? region.label : "",
      country: "AE",
      industry: "Technology",
      verificationLevel: "basic",
      verificationDocs: [],
      domainVerified: false,
      isAgentVerified: false,
      regionCityId: region ? region.cityId : null,
      regionStateId: region ? region.stateId : null,
      createdAt: now,
      updatedAt: now,
    });
    employerIds[emp.key] = insertedId;
    if (emp.agent) {
      await db.collection("agents").updateOne({ _id: agentIds[emp.agent] }, { $addToSet: { assignedEmployerIds: insertedId } });
    }
  }

  const companyOf = Object.fromEntries(EMPLOYERS.map((e) => [e.key, e.company]));
  console.log(`\nSeeded ${SUPER_AGENTS.length} super agents, ${AGENTS.length} agents, ${EMPLOYERS.length} employers.`);
  console.log(`Password for every account: ${PASSWORD}\n`);
  console.log("Expected employer lists:");
  for (const [key, keys] of Object.entries(EXPECTED)) {
    console.log(`  ${email(key).padEnd(20)} ${String(keys.length).padStart(2)}  ${keys.map((k) => companyOf[k]).join(", ")}`);
  }
  console.log("\nSeen by nobody: RQA Ajman Uncovered Co 6, RQA No Region Co 7, RQA No Region Co 8");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
