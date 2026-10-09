/**
 * Agent premium / referral QA seed.
 *
 * Seeds job seekers for agent@mployedin.com, in that agent's own region, so the
 * agent dashboard's "Talent & conversion" card (latest 3 onboarded, latest 3
 * premium) and the Job Seekers list's Make premium action can be checked:
 *
 *   p1  premium, joined through the agent's referral link, onboarded
 *   p2  premium, joined through the referral link, onboarded
 *   p3  premium, assigned to the agent directly (agentId), onboarded
 *   r1  not premium, joined through the referral link, onboarded
 *   r2  not premium, joined through the referral link, onboarded
 *   r3  not premium, joined through the referral link, NOT onboarded yet
 *   a1  not premium, only lives in the agent's area — view only, no Make premium
 *
 * Every account: <key>@agentpremium.test / AgentQa@1234
 *
 * NOTE: .env points at the shared staging database — these accounts appear
 * there. Remove them with --delete when done.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-agent-premium-seekers.mjs           (reset + seed)
 *   node --env-file=.env scripts/seed-agent-premium-seekers.mjs --delete  (remove only)
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run: node --env-file=.env scripts/seed-agent-premium-seekers.mjs");
  process.exit(1);
}

const AGENT_EMAIL = "agent@mployedin.com";
const DOMAIN = "agentpremium.test";
const PASSWORD = "AgentQa@1234";
const LINK_LABEL = "QA premium seed";
const TERMS_BASELINE_VERSION = "2026-09-29"; // src/lib/gdpr/termsVersion.ts

const SEEKERS = [
  { key: "p1", name: "Premium Referral One", premium: true, how: "referral", onboarded: true, title: "Heavy Truck Driver", skills: ["Driving", "Logistics"] },
  { key: "p2", name: "Premium Referral Two", premium: true, how: "referral", onboarded: true, title: "Electrician", skills: ["Wiring", "Maintenance"] },
  { key: "p3", name: "Premium Assigned Three", premium: true, how: "assigned", onboarded: true, title: "Site Supervisor", skills: ["Construction", "HSE"] },
  { key: "r1", name: "Referral Joined Four", premium: false, how: "referral", onboarded: true, title: "Warehouse Associate", skills: ["Forklift", "Inventory"] },
  { key: "r2", name: "Referral Joined Five", premium: false, how: "referral", onboarded: true, title: "Barista", skills: ["Coffee", "Customer Service"] },
  { key: "r3", name: "Referral Pending Six", premium: false, how: "referral", onboarded: false, title: null, skills: [] },
  { key: "a1", name: "Area Only Seven", premium: false, how: "area", onboarded: true, title: "Security Guard", skills: ["Security"] },
];

const email = (key) => `${key}@${DOMAIN}`;

async function removeSeeded(db, agent) {
  const users = await db.collection("users").find({ email: { $regex: `@${DOMAIN.replace(".", "\\.")}$` } }).project({ _id: 1 }).toArray();
  const userIds = users.map((u) => u._id);
  const seekerIds = (await db.collection("jobseekers").find({ userId: { $in: userIds } }).project({ _id: 1 }).toArray()).map((s) => s._id);
  await db.collection("referrallinks").updateMany(
    { "registrations.userId": { $in: userIds } },
    { $pull: { registrations: { userId: { $in: userIds } } } },
  );
  if (agent) {
    await db.collection("agents").updateOne({ _id: agent._id }, { $pull: { assignedJobSeekerIds: { $in: seekerIds } } });
  }
  await Promise.all([
    db.collection("jobseekers").deleteMany({ _id: { $in: seekerIds } }),
    db.collection("notifications").deleteMany({ userId: { $in: userIds } }),
    db.collection("referrallinks").deleteMany({ label: LINK_LABEL, "registrations.0": { $exists: false } }),
  ]);
  await db.collection("users").deleteMany({ _id: { $in: userIds } });
  console.log(`Removed ${userIds.length} users / ${seekerIds.length} job seekers on @${DOMAIN}.`);
}

/** The agent's seeker area: their own cities, else their super agent's. */
async function resolveArea(db, agent) {
  let cityIds = agent.assignedCityIds ?? [];
  if (cityIds.length === 0 && agent.superAgentId) {
    const sa = await db.collection("superagents").findOne({ _id: agent.superAgentId }, { projection: { assignedCityIds: 1 } });
    cityIds = sa?.assignedCityIds ?? [];
  }
  if (cityIds.length === 0) return null;
  const city = await db.collection("cities").findOne({ _id: cityIds[0] });
  if (!city) return null;
  const state = city.stateId ? await db.collection("states").findOne({ _id: city.stateId }) : null;
  return { cityId: city._id, stateId: city.stateId ?? null, label: `${city.name}${state ? `, ${state.name}` : ""}` };
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const agentUser = await db.collection("users").findOne({ email: AGENT_EMAIL }, { projection: { _id: 1, name: 1 } });
  if (!agentUser) throw new Error(`${AGENT_EMAIL} not found`);
  const agent = await db.collection("agents").findOne({ userId: agentUser._id });
  if (!agent) throw new Error(`No Agent profile for ${AGENT_EMAIL}`);

  await removeSeeded(db, agent);
  if (process.argv.includes("--delete")) {
    await mongoose.disconnect();
    return;
  }

  const area = await resolveArea(db, agent);
  if (!area) console.warn("Agent has no region (own or super agent's) — seekers get no area; a1 will not show.");

  // Reuse the agent's live job-seeker referral link; create one if they have none.
  let link = await db.collection("referrallinks").findOne({ agentId: agent._id, audience: "job_seeker", isActive: true });
  if (!link) {
    const now = new Date();
    const doc = {
      code: `QA${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      createdBy: agentUser._id,
      creatorRole: "agent",
      audience: "job_seeker",
      agentId: agent._id,
      ...(agent.superAgentId ? { superAgentId: agent.superAgentId } : {}),
      label: LINK_LABEL,
      maxUses: 0,
      usedCount: 0,
      registrations: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const { insertedId } = await db.collection("referrallinks").insertOne(doc);
    link = { ...doc, _id: insertedId };
  }

  const settings = await db.collection("systemsettings").findOne({}, { projection: { legalTermsVersion: 1 } });
  const termsVersion = settings?.legalTermsVersion || TERMS_BASELINE_VERSION;
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Stagger join dates (newest first in the list) so "latest 3" is predictable.
  const base = Date.now();
  for (const [i, s] of SEEKERS.entries()) {
    const at = new Date(base - i * 60 * 60 * 1000);
    const { insertedId: userId } = await db.collection("users").insertOne({
      name: s.name,
      email: email(s.key),
      passwordHash,
      role: "job_seeker",
      permissionMode: "role_default",
      locale: "en",
      isActive: true,
      isEmailVerified: true,
      termsAcceptedVersion: termsVersion,
      termsAcceptedAt: at,
      authProvider: "credentials",
      failedLoginAttempts: 0,
      passwordResetAttempts: 0,
      twoFactorEnabled: false,
      createdAt: at,
      updatedAt: at,
    });

    const referral = s.how === "referral"
      ? {
          linkId: link._id,
          code: link.code,
          agentId: agent._id,
          ...(agent.superAgentId ? { superAgentId: agent.superAgentId } : {}),
          referrerUserId: agentUser._id,
          referrerRole: "agent",
          referredAt: at,
        }
      : undefined;

    const { insertedId: seekerId } = await db.collection("jobseekers").insertOne({
      userId,
      fullName: s.name,
      ...(s.how === "assigned" ? { agentId: agent._id } : {}),
      ...(referral ? { referral, isAgentReferred: true } : {}),
      isOnboarded: s.onboarded,
      badges: s.premium ? ["premium"] : [],
      profileVisibility: "public",
      regionCityId: area?.cityId ?? null,
      regionStateId: area?.stateId ?? null,
      currentLocation: area ? area.label : "",
      roleArchivedAt: null,
      skills: s.skills,
      experience: s.title ? [{ jobTitle: s.title, company: "QA Seed Co", isCurrent: true, startDate: new Date("2023-01-01") }] : [],
      education: [],
      languages: [],
      certifications: [],
      preferredCountries: ["United Arab Emirates"],
      preferredRoles: s.title ? [s.title] : [],
      preferredLocations: [],
      profileCompleteness: s.onboarded ? 70 : 20,
      createdAt: at,
      updatedAt: at,
    });

    if (s.how === "assigned") {
      await db.collection("agents").updateOne({ _id: agent._id }, { $addToSet: { assignedJobSeekerIds: seekerId } });
    }
    if (referral) {
      await db.collection("referrallinks").updateOne(
        { _id: link._id },
        {
          $push: { registrations: { kind: "job_seeker", jobSeekerId: seekerId, userId, name: s.name, email: email(s.key), registeredAt: at } },
          $inc: { usedCount: 1 },
        },
      );
    }
  }

  console.log(`\nAgent: ${AGENT_EMAIL} (${agentUser.name}) — area: ${area?.label ?? "none"}`);
  console.log(`Referral link: ${link.code}${link.label === LINK_LABEL ? " (created by this seed)" : " (agent's existing link)"}`);
  console.log(`Seeded ${SEEKERS.length} job seekers, password ${PASSWORD}:`);
  for (const s of SEEKERS) {
    console.log(`  ${email(s.key).padEnd(24)} ${s.premium ? "PREMIUM" : "regular"}  ${s.how.padEnd(8)} ${s.onboarded ? "onboarded" : "not onboarded"}`);
  }
  console.log("\nExpected on the agent dashboard: latest premium = p1, p2, p3; latest onboarded = p1, p2, p3 (r1, r2, a1 behind See all).");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
