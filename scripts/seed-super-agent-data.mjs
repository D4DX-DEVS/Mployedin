/**
 * Seed script — populate SuperAgent dashboard with agents, leads, and referral links
 *
 * Usage:
 *   node --env-file=.env scripts/seed-super-agent-data.mjs
 *   node --env-file=.env scripts/seed-super-agent-data.mjs --delete
 */

import mongoose from "mongoose";
import crypto from "crypto";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    "❌  MONGODB_URI is not set.\n" +
    "    Dev:  node --env-file=.env scripts/seed-super-agent-data.mjs\n"
  );
  process.exit(1);
}

// ─── Minimal schemas (mirror src/models/) ──────────────────────────────────

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  passwordHash: String,
  role: { type: String, enum: ["admin", "super_agent", "agent", "employer", "job_seeker"] },
  locale: { type: String, default: "en" },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: true },
}, { timestamps: true });

const SuperAgentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  referralCode: { type: String, unique: true, sparse: true },
  assignedCityIds: [{ type: mongoose.Schema.Types.ObjectId }],
  assignedStateIds: [{ type: mongoose.Schema.Types.ObjectId }],
  agentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Agent" }],
  commissions: {
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
  },
  overrideRate: { type: Number, default: 0 },
  country: { type: String, default: "" },
  currencyCode: { type: String, default: "AED" },
  timezone: { type: String, default: "Asia/Dubai" },
  workingHoursStart: { type: String, default: "09:00" },
  workingHoursEnd: { type: String, default: "18:00" },
  workingDays: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
}, { timestamps: true });

const AgentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  superAgentId: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAgent" },
  referralCode: { type: String, unique: true, sparse: true },
  assignedCityIds: [{ type: mongoose.Schema.Types.ObjectId }],
  assignedStateIds: [{ type: mongoose.Schema.Types.ObjectId }],
  assignedEmployerIds: [{ type: mongoose.Schema.Types.ObjectId }],
  assignedJobSeekerIds: [{ type: mongoose.Schema.Types.ObjectId }],
  performance: {
    leadsGenerated: { type: Number, default: 0 },
    employersCreated: { type: Number, default: 0 },
    vacanciesPosted: { type: Number, default: 0 },
    jobSeekersSubmitted: { type: Number, default: 0 },
    interviewsScheduled: { type: Number, default: 0 },
    placementsCompleted: { type: Number, default: 0 },
  },
  activityLog: [{ action: String, targetId: mongoose.Schema.Types.ObjectId, targetType: String, meta: mongoose.Schema.Types.Mixed, timestamp: { type: Date, default: Date.now }, _id: false }],
  commissionRate: { type: Number, default: 0 },
  country: { type: String, default: "" },
  currencyCode: { type: String, default: "AED" },
  timezone: { type: String, default: "Asia/Dubai" },
  workingHoursStart: { type: String, default: "09:00" },
  workingHoursEnd: { type: String, default: "18:00" },
  workingDays: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
}, { timestamps: true });

const LeadSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
  superAgentId: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAgent" },
  companyName: { type: String, required: true },
  contactPerson: { type: String, required: true },
  contactEmail: String,
  contactPhone: String,
  country: String,
  industry: String,
  status: { type: String, enum: ["new", "contacted", "interested", "negotiating", "converted", "lost"], default: "new" },
  source: String,
  notes: String,
  followUpAt: Date,
  convertedAt: Date,
  convertedToEmployerId: { type: mongoose.Schema.Types.ObjectId },
  activityLog: [{ action: String, note: String, timestamp: { type: Date, default: Date.now }, by: mongoose.Schema.Types.ObjectId, _id: false }],
}, { timestamps: true });

const ReferralLinkSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  creatorRole: { type: String, enum: ["agent", "super_agent"], required: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
  superAgentId: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAgent" },
  label: { type: String, trim: true },
  expiresAt: Date,
  maxUses: { type: Number, default: 0 },
  usedCount: { type: Number, default: 0 },
  registrations: [{
    employerId: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
    companyName: String,
    email: String,
    country: String,
    city: String,
    registeredAt: { type: Date, default: Date.now },
    _id: false,
  }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const SuperAgent = mongoose.models.SuperAgent || mongoose.model("SuperAgent", SuperAgentSchema);
const Agent = mongoose.models.Agent || mongoose.model("Agent", AgentSchema);
const Lead = mongoose.models.Lead || mongoose.model("Lead", LeadSchema);
const ReferralLink = mongoose.models.ReferralLink || mongoose.model("ReferralLink", ReferralLinkSchema);

function genCode() {
  return "MPL-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

const isDelete = process.argv.includes("--delete");

// ─── Agent user seeds (will be linked to super agent) ─────────────────────
const AGENT_USERS = [
  { name: "Agent Ahmed",  email: "agent.ahmed@mployedin.com",  role: "agent" },
  { name: "Agent Sara",   email: "agent.sara@mployedin.com",   role: "agent" },
  { name: "Agent Khalid", email: "agent.khalid@mployedin.com", role: "agent" },
];

// ─── Lead data (spread across agents) ─────────────────────────────────────
const LEADS_DATA = [
  { companyName: "TechVentures LLC",     contactPerson: "Omar Al-Rashid",   contactEmail: "omar@techventures.ae",    contactPhone: "+971501234567", country: "UAE", industry: "Technology",    status: "new",         source: "LinkedIn",          notes: "Interested in hiring 5 developers" },
  { companyName: "Gulf Finance Corp",    contactPerson: "Fatima Hassan",    contactEmail: "fatima@gulffinance.ae",   contactPhone: "+971502345678", country: "UAE", industry: "Finance",       status: "contacted",   source: "Referral",          notes: "Met at Dubai Finance Summit" },
  { companyName: "MedCare Solutions",    contactPerson: "Dr. Aisha Mahmoud",contactEmail: "aisha@medcare.sa",        contactPhone: "+966511234567", country: "SA",  industry: "Healthcare",    status: "interested",  source: "Cold Call",          notes: "Need 10 nurses and 3 doctors" },
  { companyName: "Desert Construction",  contactPerson: "Yusuf Khan",       contactEmail: "yusuf@desertcon.ae",      contactPhone: "+971503456789", country: "UAE", industry: "Construction",  status: "negotiating", source: "Website",           notes: "Large project starting Q3, 50+ workers" },
  { companyName: "Al-Noor Hospitality",  contactPerson: "Layla Said",       contactEmail: "layla@alnoor.ae",         contactPhone: "+971504567890", country: "UAE", industry: "Hospitality",   status: "converted",   source: "Agent Outreach",    notes: "Signed up, onboarding complete" },
  { companyName: "Falcon Logistics",     contactPerson: "Hassan Qureshi",   contactEmail: "hassan@falconlog.ae",     contactPhone: "+971505678901", country: "UAE", industry: "Logistics",     status: "lost",        source: "Trade Show",        notes: "Went with competitor" },
  { companyName: "Emerald Education",    contactPerson: "Nadia Al-Farsi",   contactEmail: "nadia@emeraldedu.om",     contactPhone: "+96824123456",  country: "OM",  industry: "Education",     status: "new",         source: "LinkedIn",          notes: "Opening new branch, need 20 teachers" },
  { companyName: "Byte Solutions",       contactPerson: "Rami Tawfik",      contactEmail: "rami@bytesol.ae",         contactPhone: "+971506789012", country: "UAE", industry: "Technology",    status: "contacted",   source: "Referral",          notes: "Startup, hiring aggressively" },
  { companyName: "Pearl Properties",     contactPerson: "Samira Ahmed",     contactEmail: "samira@pearlprop.qa",     contactPhone: "+97444123456",  country: "QA",  industry: "Real Estate",   status: "interested",  source: "Event",             notes: "Expanding to 3 new locations" },
  { companyName: "Crescent Manufacturing",contactPerson: "Abdul Rahman",    contactEmail: "abdul@crescentmfg.bh",    contactPhone: "+97317123456",  country: "BH",  industry: "Manufacturing", status: "new",         source: "Cold Call",          notes: "Factory expansion, blue-collar hiring" },
  { companyName: "Oasis Retail Group",   contactPerson: "Mariam Jaber",     contactEmail: "mariam@oasisretail.ae",   contactPhone: "+971507890123", country: "UAE", industry: "Retail",        status: "negotiating", source: "Referral",          notes: "Seasonal hiring for 100+ staff" },
  { companyName: "Zenith IT Services",   contactPerson: "Tariq Nasser",     contactEmail: "tariq@zenithit.ae",       contactPhone: "+971508901234", country: "UAE", industry: "Technology",    status: "interested",  source: "Website",           notes: "Looking for cybersecurity team" },
];

async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  if (isDelete) {
    console.log("🗑️  Deleting seeded super-agent data…");
    const agentEmails = AGENT_USERS.map((a) => a.email);
    const agentUsers = await User.find({ email: { $in: agentEmails } });
    const agentUserIds = agentUsers.map((u) => u._id);

    // Delete agents
    const agents = await Agent.find({ userId: { $in: agentUserIds } });
    const agentIds = agents.map((a) => a._id);

    // Delete leads belonging to these agents
    const leadResult = await Lead.deleteMany({ agentId: { $in: agentIds } });
    console.log(`  Leads deleted: ${leadResult.deletedCount}`);

    // Delete referral links created by these agents
    const refResult = await ReferralLink.deleteMany({ createdBy: { $in: agentUserIds } });
    console.log(`  Referral links deleted: ${refResult.deletedCount}`);

    // Delete agents
    const agentResult = await Agent.deleteMany({ userId: { $in: agentUserIds } });
    console.log(`  Agents deleted: ${agentResult.deletedCount}`);

    // Remove agent refs from super agent
    const saUser = await User.findOne({ email: "superagent@mployedin.com" });
    if (saUser) {
      await SuperAgent.updateOne({ userId: saUser._id }, { $set: { agentIds: [] } });
      console.log("  SuperAgent agentIds cleared");
    }

    // Delete agent users
    const userResult = await User.deleteMany({ email: { $in: agentEmails } });
    console.log(`  Agent users deleted: ${userResult.deletedCount}`);

    // Also delete referral links for superagent and main agent
    const mainAgentUser = await User.findOne({ email: "agent@mployedin.com" });
    if (mainAgentUser) {
      const mainRefResult = await ReferralLink.deleteMany({ createdBy: mainAgentUser._id });
      console.log(`  Main agent referral links deleted: ${mainRefResult.deletedCount}`);
    }
    if (saUser) {
      const saRefResult = await ReferralLink.deleteMany({ createdBy: saUser._id });
      console.log(`  SuperAgent referral links deleted: ${saRefResult.deletedCount}`);
    }

    console.log("✅ Cleanup complete\n");
    await mongoose.disconnect();
    return;
  }

  // ─── Step 1: Find or create SuperAgent profile ──────────────────────────
  console.log("▶ Step 1: Setting up SuperAgent profile…");
  const saUser = await User.findOne({ email: "superagent@mployedin.com" });
  if (!saUser) {
    console.log("  ✗ SuperAgent user not found. Run: node --env-file=.env scripts/create-admin.mjs first");
    await mongoose.disconnect();
    return;
  }

  let superAgent = await SuperAgent.findOne({ userId: saUser._id });
  if (!superAgent) {
    superAgent = await SuperAgent.create({
      userId: saUser._id,
      referralCode: genCode(),
      country: "UAE",
      commissions: { total: 15000, pending: 5000, paid: 10000 },
      overrideRate: 5,
    });
    console.log(`  ✓ Created SuperAgent profile: ${superAgent.referralCode}`);
  } else {
    // Update commissions if empty
    if (superAgent.commissions.total === 0) {
      superAgent.commissions = { total: 15000, pending: 5000, paid: 10000 };
      superAgent.overrideRate = 5;
      await superAgent.save();
    }
    console.log(`  ✓ SuperAgent exists: ${superAgent.referralCode}`);
  }

  // ─── Step 2: Create Agent users + Agent profiles ────────────────────────
  console.log("\n▶ Step 2: Creating agent users & profiles…");
  const bcrypt = await import("bcryptjs");
  const agentDocs = [];

  for (const au of AGENT_USERS) {
    // Create user
    const passwordHash = await bcrypt.hash("Agent@1234", 12);
    const user = await User.findOneAndUpdate(
      { email: au.email },
      { name: au.name, email: au.email, passwordHash, role: au.role, locale: "en", isActive: true, isEmailVerified: true },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    // Create agent profile
    let agent = await Agent.findOne({ userId: user._id });
    if (!agent) {
      agent = await Agent.create({
        userId: user._id,
        superAgentId: superAgent._id,
        referralCode: genCode(),
        country: "UAE",
        commissionRate: 10,
        performance: {
          leadsGenerated: Math.floor(Math.random() * 20) + 5,
          employersCreated: Math.floor(Math.random() * 10) + 2,
          vacanciesPosted: Math.floor(Math.random() * 15) + 3,
          jobSeekersSubmitted: Math.floor(Math.random() * 30) + 10,
          interviewsScheduled: Math.floor(Math.random() * 12) + 3,
          placementsCompleted: Math.floor(Math.random() * 8) + 1,
        },
      });
    }
    agentDocs.push(agent);
    console.log(`  ✓ ${au.name} (${au.email}) → Agent ${agent.referralCode}`);
  }

  // ─── Also ensure main agent@mployedin.com has Agent profile ─────────────
  const mainAgentUser = await User.findOne({ email: "agent@mployedin.com" });
  if (mainAgentUser) {
    let mainAgent = await Agent.findOne({ userId: mainAgentUser._id });
    if (!mainAgent) {
      mainAgent = await Agent.create({
        userId: mainAgentUser._id,
        superAgentId: superAgent._id,
        referralCode: genCode(),
        country: "UAE",
        commissionRate: 12,
        performance: {
          leadsGenerated: 15,
          employersCreated: 8,
          vacanciesPosted: 12,
          jobSeekersSubmitted: 25,
          interviewsScheduled: 10,
          placementsCompleted: 5,
        },
      });
      console.log(`  ✓ Main agent (agent@mployedin.com) → Agent ${mainAgent.referralCode}`);
    } else {
      console.log(`  ✓ Main agent exists: ${mainAgent.referralCode}`);
    }
    agentDocs.push(mainAgent);
  }

  // ─── Step 3: Link agents to SuperAgent ──────────────────────────────────
  console.log("\n▶ Step 3: Linking agents to SuperAgent…");
  superAgent.agentIds = agentDocs.map((a) => a._id);
  await superAgent.save();
  console.log(`  ✓ ${agentDocs.length} agents linked to SuperAgent`);

  // ─── Step 4: Create Leads ───────────────────────────────────────────────
  console.log("\n▶ Step 4: Seeding leads across agents…");
  let leadsCreated = 0;

  for (let i = 0; i < LEADS_DATA.length; i++) {
    const ld = LEADS_DATA[i];
    const assignedAgent = agentDocs[i % agentDocs.length];

    const existing = await Lead.findOne({
      agentId: assignedAgent._id,
      companyName: ld.companyName,
    });
    if (existing) {
      console.log(`  ─ Lead "${ld.companyName}" already exists, skipping`);
      continue;
    }

    const followUpAt = ld.status === "new" || ld.status === "contacted"
      ? new Date(Date.now() + Math.floor(Math.random() * 7) * 86400000)
      : undefined;

    await Lead.create({
      agentId: assignedAgent._id,
      superAgentId: superAgent._id,
      companyName: ld.companyName,
      contactPerson: ld.contactPerson,
      contactEmail: ld.contactEmail,
      contactPhone: ld.contactPhone,
      country: ld.country,
      industry: ld.industry,
      status: ld.status,
      source: ld.source,
      notes: ld.notes,
      followUpAt,
      convertedAt: ld.status === "converted" ? new Date() : undefined,
      activityLog: [
        { action: "created", note: "Lead created via seed script", timestamp: new Date() },
        ...(ld.status !== "new" ? [{ action: "status_changed", note: `Status: ${ld.status}`, timestamp: new Date() }] : []),
      ],
    });
    leadsCreated++;
  }
  console.log(`  ✓ ${leadsCreated} leads created`);

  // ─── Step 5: Create Referral Links ──────────────────────────────────────
  console.log("\n▶ Step 5: Creating referral links…");

  // SuperAgent referral link
  let saRefLink = await ReferralLink.findOne({ createdBy: saUser._id });
  if (!saRefLink) {
    saRefLink = await ReferralLink.create({
      code: superAgent.referralCode,
      createdBy: saUser._id,
      creatorRole: "super_agent",
      superAgentId: superAgent._id,
      label: "SuperAgent Main Link",
      maxUses: 0,
      usedCount: 3,
      registrations: [
        { employerId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), companyName: "Alpha Tech UAE", email: "alpha@test.ae", country: "UAE", city: "Dubai", registeredAt: new Date(Date.now() - 7 * 86400000) },
        { employerId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), companyName: "Beta Services Qatar", email: "beta@test.qa", country: "QA", city: "Doha", registeredAt: new Date(Date.now() - 3 * 86400000) },
        { employerId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), companyName: "Gamma Industries SA", email: "gamma@test.sa", country: "SA", city: "Riyadh", registeredAt: new Date(Date.now() - 1 * 86400000) },
      ],
      isActive: true,
    });
    console.log(`  ✓ SuperAgent referral link: ${saRefLink.code} (3 registrations)`);
  } else {
    console.log(`  ─ SuperAgent referral link exists: ${saRefLink.code}`);
  }

  // Agent referral links
  for (const agent of agentDocs) {
    const agentUser = await User.findById(agent.userId);
    if (!agentUser) continue;

    let refLink = await ReferralLink.findOne({ createdBy: agentUser._id });
    if (!refLink) {
      const regCount = Math.floor(Math.random() * 3);
      const regs = [];
      for (let r = 0; r < regCount; r++) {
        regs.push({
          employerId: new mongoose.Types.ObjectId(),
          userId: new mongoose.Types.ObjectId(),
          companyName: `Seed Company ${r + 1} (${agentUser.name})`,
          email: `seed${r + 1}-${agentUser.name.replace(/\s/g, "").toLowerCase()}@test.com`,
          country: "UAE",
          city: "Dubai",
          registeredAt: new Date(Date.now() - Math.floor(Math.random() * 14) * 86400000),
        });
      }

      refLink = await ReferralLink.create({
        code: agent.referralCode,
        createdBy: agentUser._id,
        creatorRole: "agent",
        agentId: agent._id,
        superAgentId: superAgent._id,
        label: `${agentUser.name} Main Link`,
        maxUses: 0,
        usedCount: regCount,
        registrations: regs,
        isActive: true,
      });
      console.log(`  ✓ ${agentUser.name} referral link: ${refLink.code} (${regCount} registrations)`);
    } else {
      console.log(`  ─ ${agentUser.name} referral link exists: ${refLink.code}`);
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  const totalAgents = await Agent.countDocuments({ superAgentId: superAgent._id });
  const totalLeads = await Lead.countDocuments({ superAgentId: superAgent._id });
  const totalRefLinks = await ReferralLink.countDocuments({
    $or: [{ superAgentId: superAgent._id }, { createdBy: saUser._id }],
  });

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  SEED SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  SuperAgent: ${saUser.name} (${saUser.email})`);
  console.log(`  Referral Code: ${superAgent.referralCode}`);
  console.log(`  Agents under SA: ${totalAgents}`);
  console.log(`  Leads created: ${totalLeads}`);
  console.log(`  Referral links: ${totalRefLinks}`);
  console.log(`  Commissions: total=${superAgent.commissions.total}, pending=${superAgent.commissions.pending}, paid=${superAgent.commissions.paid}`);
  console.log("═══════════════════════════════════════════════════");
  console.log("\n  Login credentials:");
  console.log("  SuperAgent: superagent@mployedin.com / SuperAgent@1234");
  console.log("  Agent:      agent@mployedin.com / Agent@1234");
  for (const au of AGENT_USERS) {
    console.log(`  Agent:      ${au.email} / Agent@1234`);
  }
  console.log("\n  Dashboard: /en/super-agent");
  console.log("═══════════════════════════════════════════════════\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
