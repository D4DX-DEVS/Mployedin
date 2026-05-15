/**
 * Seed script — Kerala team: Super Agents + Agents + Employers + Jobs
 *
 * Creates:
 *   - India country (if not exists)
 *   - Kerala state
 *   - 6 Kerala districts (Ernakulam, Malappuram, Kozhikode, Thrissur, Thiruvananthapuram, Kottayam)
 *   - 3 Super Agents (each assigned 2 districts)
 *   - 6 Agents (2 per Super Agent)
 *   - 6 Employers (1 per agent)
 *   - 12 Jobs (2 per employer, assigned to their agent) — status: "active"
 *
 * Usage:
 *   node --env-file=.env scripts/seed-kerala-team.mjs
 *   node --env-file=.env scripts/seed-kerala-team.mjs --delete   (to remove seeded data)
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set.\n    node --env-file=.env scripts/seed-kerala-team.mjs");
  process.exit(1);
}

// ─── Schemas (mirrors src/models/) ──────────────────────────────────────────

const UserSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  email:           { type: String, required: true, unique: true, lowercase: true },
  passwordHash:    { type: String },
  role:            { type: String, enum: ["admin","super_agent","agent","employer","job_seeker"] },
  locale:          { type: String, default: "en" },
  isActive:        { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: true },
  authProvider:    { type: String, default: "credentials" },
}, { timestamps: true });

const CountrySchema = new mongoose.Schema({
  name:             { type: String, required: true, trim: true },
  nameAr:           { type: String, default: "", trim: true },
  code:             { type: String, required: true, unique: true, uppercase: true, trim: true },
  phoneCode:        { type: String, default: "" },
  currency:         { type: String, default: "" },
  currencyCode:     { type: String, default: "", uppercase: true },
  currencySymbol:   { type: String, default: "" },
  thousandSeparator: { type: String, default: "," },
  decimalSeparator:  { type: String, default: "." },
  sortOrder:        { type: Number, default: 0 },
  isActive:         { type: Boolean, default: true },
}, { timestamps: true });

const StateSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  nameAr:    { type: String, default: "", trim: true },
  countryId: { type: mongoose.Schema.Types.ObjectId, ref: "Country", required: true },
  slug:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  sortOrder: { type: Number, default: 0 },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

const CitySchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  nameAr:   { type: String, default: "", trim: true },
  stateId:  { type: mongoose.Schema.Types.ObjectId, ref: "State", required: true },
  slug:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  sortOrder: { type: Number, default: 0 },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

const SuperAgentSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  referralCode:    { type: String, unique: true, sparse: true },
  assignedCityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "City" }],
  assignedStateIds:[{ type: mongoose.Schema.Types.ObjectId, ref: "State" }],
  agentIds:        [{ type: mongoose.Schema.Types.ObjectId, ref: "Agent" }],
  commissions:     { total: { type: Number, default: 0 }, pending: { type: Number, default: 0 }, paid: { type: Number, default: 0 } },
  overrideRate:    { type: Number, default: 0 },
  country:         { type: String, default: "" },
  currencyCode:    { type: String, default: "INR" },
  timezone:        { type: String, default: "Asia/Kolkata" },
}, { timestamps: true });

const AgentSchema = new mongoose.Schema({
  userId:              { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  superAgentId:        { type: mongoose.Schema.Types.ObjectId, ref: "SuperAgent" },
  referralCode:        { type: String, unique: true, sparse: true },
  assignedCityIds:     [{ type: mongoose.Schema.Types.ObjectId, ref: "City" }],
  assignedStateIds:    [{ type: mongoose.Schema.Types.ObjectId, ref: "State" }],
  assignedEmployerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employer" }],
  performance:         {
    leadsGenerated: { type: Number, default: 0 },
    employersCreated: { type: Number, default: 0 },
    vacanciesPosted: { type: Number, default: 0 },
    jobSeekersSubmitted: { type: Number, default: 0 },
    interviewsScheduled: { type: Number, default: 0 },
    placementsCompleted: { type: Number, default: 0 },
  },
  commissionRate: { type: Number, default: 10 },
  country:        { type: String, default: "" },
  currencyCode:   { type: String, default: "INR" },
  timezone:       { type: String, default: "Asia/Kolkata" },
}, { timestamps: true });

const EmployerSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  agentId:      { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
  companyName:  { type: String, required: true, trim: true },
  companyEmail: { type: String, required: true, lowercase: true },
  phone:        { type: String, required: true },
  designation:  { type: String },
  country:      { type: String },
  industry:     { type: String },
  companySize:  { type: String },
  description:  { type: String },
  jobIds:       [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],
  verificationLevel: { type: String, default: "basic" },
  paymentStatus:     { type: String, default: "active" },
  isAgentVerified:   { type: Boolean, default: true },
  workflowMode:      { type: String, default: "manual" },
}, { timestamps: true });

const JobSchema = new mongoose.Schema({
  employerId:  { type: mongoose.Schema.Types.ObjectId, ref: "Employer", required: true },
  agentId:     { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
  title:       { type: String, required: true, trim: true },
  description: { type: String, required: true },
  requirements: {
    skills:        [String],
    experienceMin: { type: Number, default: 0 },
    experienceMax: { type: Number, default: 5 },
    languages:     [String],
  },
  employmentType: { type: String, default: "full_time" },
  workMode:       { type: String, default: "onsite" },
  salary: {
    min:      { type: Number },
    max:      { type: Number },
    currency: { type: String, default: "INR" },
    period:   { type: String, default: "monthly" },
  },
  location: {
    country:  { type: String, default: "India" },
    city:     { type: String },
    isRemote: { type: Boolean, default: false },
  },
  status:       { type: String, default: "active" },
  workflowMode: { type: String, default: "manual" },
  visibility:   { type: String, default: "public" },
  vacancies:    { type: Number, default: 1 },
  views:        { type: Number, default: 0 },
  uniqueViews:  { type: Number, default: 0 },
  tags:         [String],
  applicantIds: [{ type: mongoose.Schema.Types.ObjectId }],
}, { timestamps: true });

// ─── Models ──────────────────────────────────────────────────────────────────

const User       = mongoose.models.User       || mongoose.model("User", UserSchema);
const Country    = mongoose.models.Country    || mongoose.model("Country", CountrySchema);
const State      = mongoose.models.State      || mongoose.model("State", StateSchema);
const City       = mongoose.models.City       || mongoose.model("City", CitySchema);
const SuperAgent = mongoose.models.SuperAgent || mongoose.model("SuperAgent", SuperAgentSchema);
const Agent      = mongoose.models.Agent      || mongoose.model("Agent", AgentSchema);
const Employer   = mongoose.models.Employer   || mongoose.model("Employer", EmployerSchema);
const Job        = mongoose.models.Job        || mongoose.model("Job", JobSchema);

// ─── Seed Data ───────────────────────────────────────────────────────────────

const PASSWORD = "Kerala@1234";

const KERALA_DISTRICTS = [
  { name: "Ernakulam",          slug: "ernakulam" },
  { name: "Malappuram",         slug: "malappuram" },
  { name: "Kozhikode",          slug: "kozhikode" },
  { name: "Thrissur",           slug: "thrissur" },
  { name: "Thiruvananthapuram", slug: "thiruvananthapuram" },
  { name: "Kottayam",           slug: "kottayam" },
];

const SUPER_AGENTS = [
  { name: "Rajesh Kumar",    email: "rajesh.sa@mployedin.com",  districts: ["Ernakulam", "Malappuram"],         overrideRate: 15 },
  { name: "Priya Nair",      email: "priya.sa@mployedin.com",   districts: ["Kozhikode", "Thrissur"],           overrideRate: 12 },
  { name: "Arun Menon",      email: "arun.sa@mployedin.com",    districts: ["Thiruvananthapuram", "Kottayam"],  overrideRate: 10 },
];

const AGENTS = [
  // Under Rajesh (Ernakulam + Malappuram)
  { name: "Deepa Rajan",     email: "deepa.agent@mployedin.com",   saIndex: 0, districts: ["Ernakulam"],   commissionRate: 10 },
  { name: "Suresh Pillai",   email: "suresh.agent@mployedin.com",  saIndex: 0, districts: ["Malappuram"],  commissionRate: 8  },
  // Under Priya (Kozhikode + Thrissur)
  { name: "Anitha Thomas",   email: "anitha.agent@mployedin.com",  saIndex: 1, districts: ["Kozhikode"],   commissionRate: 10 },
  { name: "Vijay Mohan",     email: "vijay.agent@mployedin.com",   saIndex: 1, districts: ["Thrissur"],    commissionRate: 9  },
  // Under Arun (Thiruvananthapuram + Kottayam)
  { name: "Lakshmi Devi",    email: "lakshmi.agent@mployedin.com", saIndex: 2, districts: ["Thiruvananthapuram"], commissionRate: 10 },
  { name: "Manoj George",    email: "manoj.agent@mployedin.com",   saIndex: 2, districts: ["Kottayam"],    commissionRate: 8  },
];

const EMPLOYERS = [
  { name: "TechPark Kochi HR",    email: "hr@techparkkochi.com",    company: "TechPark Solutions",       phone: "+91-484-2345678", industry: "IT Services",   city: "Ernakulam",          agentIndex: 0 },
  { name: "Malabar Foods Admin",   email: "hr@malabarfoods.com",    company: "Malabar Foods Pvt Ltd",    phone: "+91-483-2456789", industry: "Food & Bev",    city: "Malappuram",         agentIndex: 1 },
  { name: "Calicut Digital",       email: "jobs@calicutdigital.com", company: "Calicut Digital Studio",   phone: "+91-495-2567890", industry: "Media",         city: "Kozhikode",          agentIndex: 2 },
  { name: "Thrissur Builders HR",  email: "hr@thrissurbuilders.com", company: "Thrissur Construction Co", phone: "+91-487-2678901", industry: "Construction",  city: "Thrissur",           agentIndex: 3 },
  { name: "TVM HealthCare Admin",  email: "hr@tvmhealthcare.com",   company: "TVM HealthCare Group",     phone: "+91-471-2789012", industry: "Healthcare",    city: "Thiruvananthapuram", agentIndex: 4 },
  { name: "Kottayam Rubber Co",    email: "hr@kottayamrubber.com",  company: "Kottayam Rubber & Spice",  phone: "+91-481-2890123", industry: "Manufacturing", city: "Kottayam",           agentIndex: 5 },
];

const JOBS = [
  // TechPark Kochi (Ernakulam) — 2 jobs
  { empIndex: 0, title: "Full Stack Developer",     city: "Ernakulam",          skills: ["React", "Node.js", "MongoDB"],     salaryMin: 40000, salaryMax: 80000, tags: ["tech", "developer", "full-stack"] },
  { empIndex: 0, title: "UI/UX Designer",           city: "Ernakulam",          skills: ["Figma", "Adobe XD", "CSS"],        salaryMin: 30000, salaryMax: 60000, tags: ["design", "ui", "ux"] },
  // Malabar Foods (Malappuram) — 2 jobs
  { empIndex: 1, title: "Quality Control Manager",  city: "Malappuram",         skills: ["FSSAI", "Quality Audit", "HACCP"], salaryMin: 25000, salaryMax: 45000, tags: ["food", "quality", "manager"] },
  { empIndex: 1, title: "Delivery Operations Head", city: "Malappuram",         skills: ["Logistics", "Fleet Mgmt"],         salaryMin: 30000, salaryMax: 50000, tags: ["logistics", "delivery", "ops"] },
  // Calicut Digital (Kozhikode) — 2 jobs
  { empIndex: 2, title: "Video Editor",             city: "Kozhikode",          skills: ["Premiere Pro", "After Effects"],   salaryMin: 20000, salaryMax: 40000, tags: ["media", "video", "editor"] },
  { empIndex: 2, title: "Social Media Manager",     city: "Kozhikode",          skills: ["Meta Ads", "Analytics", "Content"],salaryMin: 22000, salaryMax: 38000, tags: ["marketing", "social-media"] },
  // Thrissur Construction (Thrissur) — 2 jobs
  { empIndex: 3, title: "Site Engineer",             city: "Thrissur",           skills: ["AutoCAD", "Civil Eng", "Safety"],  salaryMin: 35000, salaryMax: 55000, tags: ["construction", "engineer"] },
  { empIndex: 3, title: "Project Coordinator",       city: "Thrissur",           skills: ["MS Project", "Planning"],          salaryMin: 28000, salaryMax: 45000, tags: ["project", "coordinator"] },
  // TVM HealthCare (Thiruvananthapuram) — 2 jobs
  { empIndex: 4, title: "Staff Nurse",               city: "Thiruvananthapuram", skills: ["BSc Nursing", "ICU", "Patient Care"], salaryMin: 25000, salaryMax: 40000, tags: ["healthcare", "nurse"] },
  { empIndex: 4, title: "Lab Technician",            city: "Thiruvananthapuram", skills: ["Pathology", "Blood Bank", "NABL"], salaryMin: 20000, salaryMax: 35000, tags: ["lab", "healthcare", "technician"] },
  // Kottayam Rubber (Kottayam) — 2 jobs
  { empIndex: 5, title: "Production Supervisor",     city: "Kottayam",           skills: ["Rubber Processing", "Quality"],    salaryMin: 30000, salaryMax: 50000, tags: ["manufacturing", "production"] },
  { empIndex: 5, title: "Export Sales Executive",    city: "Kottayam",           skills: ["Export Docs", "B2B Sales", "CRM"], salaryMin: 25000, salaryMax: 45000, tags: ["sales", "export", "b2b"] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALL_EMAILS = [
  ...SUPER_AGENTS.map(s => s.email),
  ...AGENTS.map(a => a.email),
  ...EMPLOYERS.map(e => e.email),
];

async function upsertUser(data) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  return User.findOneAndUpdate(
    { email: data.email },
    { ...data, passwordHash, locale: "en", isActive: true, isEmailVerified: true, authProvider: "credentials" },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const isDelete = process.argv.includes("--delete");

  if (isDelete) {
    console.log("🗑️  Deleting seeded Kerala data…\n");

    // Find users to delete
    const users = await User.find({ email: { $in: ALL_EMAILS } }).lean();
    const userIds = users.map(u => u._id);

    // Delete jobs by employers
    const employers = await Employer.find({ userId: { $in: userIds } }).lean();
    const employerIds = employers.map(e => e._id);
    const jobResult = await Job.deleteMany({ employerId: { $in: employerIds } });
    console.log(`  Jobs:         ${jobResult.deletedCount} deleted`);

    const empResult = await Employer.deleteMany({ userId: { $in: userIds } });
    console.log(`  Employers:    ${empResult.deletedCount} deleted`);

    const agentResult = await Agent.deleteMany({ userId: { $in: userIds } });
    console.log(`  Agents:       ${agentResult.deletedCount} deleted`);

    const saResult = await SuperAgent.deleteMany({ userId: { $in: userIds } });
    console.log(`  Super Agents: ${saResult.deletedCount} deleted`);

    const userResult = await User.deleteMany({ email: { $in: ALL_EMAILS } });
    console.log(`  Users:        ${userResult.deletedCount} deleted`);

    // Don't delete districts/state/country — they may be shared
    console.log("\n✅ Cleanup done (kept locations)\n");
    await mongoose.disconnect();
    return;
  }

  // ── Step 1: Country (India) ─────────────────────────────────────────────

  console.log("🇮🇳 Step 1: India country…");
  let india = await Country.findOne({ code: "IN" });
  if (!india) {
    india = await Country.create({
      name: "India", nameAr: "الهند", code: "IN",
      phoneCode: "91", currency: "Rupees", currencyCode: "INR",
      currencySymbol: "₹", sortOrder: 10,
    });
    console.log("  Created India");
  } else {
    console.log("  India already exists");
  }

  // ── Step 2: Kerala state ────────────────────────────────────────────────

  console.log("🌴 Step 2: Kerala state…");
  let kerala = await State.findOne({ slug: "kerala" });
  if (!kerala) {
    kerala = await State.create({
      name: "Kerala", nameAr: "كيرالا", countryId: india._id, slug: "kerala", sortOrder: 1,
    });
    console.log("  Created Kerala");
  } else {
    console.log("  Kerala already exists");
  }

  // ── Step 3: Districts (Cities) ──────────────────────────────────────────

  console.log("🏘️  Step 3: Kerala districts…");
  const cityMap = {};
  for (const d of KERALA_DISTRICTS) {
    let city = await City.findOne({ slug: d.slug });
    if (!city) {
      city = await City.create({ name: d.name, nameAr: "", stateId: kerala._id, slug: d.slug });
      console.log(`  Created ${d.name}`);
    } else {
      console.log(`  ${d.name} already exists`);
    }
    cityMap[d.name] = city;
  }

  // ── Step 4: Super Agents ────────────────────────────────────────────────

  console.log("\n👔 Step 4: Super Agents…");
  const saProfiles = [];
  for (const sa of SUPER_AGENTS) {
    const user = await upsertUser({ name: sa.name, email: sa.email, role: "super_agent" });

    const districtCityIds = sa.districts.map(d => cityMap[d]._id);

    const profile = await SuperAgent.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        assignedCityIds: districtCityIds,
        assignedStateIds: [kerala._id],
        overrideRate: sa.overrideRate,
        country: "India",
        currencyCode: "INR",
        timezone: "Asia/Kolkata",
        referralCode: `SA-${sa.name.split(" ")[0].toUpperCase()}`,
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    saProfiles.push(profile);
    console.log(`  ✅ ${sa.name} (${sa.email}) → ${sa.districts.join(", ")}`);
  }

  // ── Step 5: Agents ──────────────────────────────────────────────────────

  console.log("\n🧑‍💼 Step 5: Agents…");
  const agentProfiles = [];
  for (const ag of AGENTS) {
    const user = await upsertUser({ name: ag.name, email: ag.email, role: "agent" });
    const saProfile = saProfiles[ag.saIndex];

    const districtCityIds = ag.districts.map(d => cityMap[d]._id);

    const profile = await Agent.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        superAgentId: saProfile._id,
        assignedCityIds: districtCityIds,
        assignedStateIds: [kerala._id],
        commissionRate: ag.commissionRate,
        country: "India",
        currencyCode: "INR",
        timezone: "Asia/Kolkata",
        referralCode: `AG-${ag.name.split(" ")[0].toUpperCase()}`,
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    agentProfiles.push(profile);

    // Link agent into SA's agentIds
    await SuperAgent.updateOne(
      { _id: saProfile._id },
      { $addToSet: { agentIds: profile._id } }
    );

    console.log(`  ✅ ${ag.name} (${ag.email}) → under ${SUPER_AGENTS[ag.saIndex].name}, ${ag.districts.join(", ")}`);
  }

  // ── Step 6: Employers ───────────────────────────────────────────────────

  console.log("\n🏢 Step 6: Employers…");
  const employerProfiles = [];
  for (const emp of EMPLOYERS) {
    const user = await upsertUser({ name: emp.name, email: emp.email, role: "employer" });
    const agentProfile = agentProfiles[emp.agentIndex];

    const profile = await Employer.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        agentId: agentProfile._id,
        companyName: emp.company,
        companyEmail: emp.email,
        phone: emp.phone,
        industry: emp.industry,
        country: "India",
        description: `${emp.company} — leading company in ${emp.industry} sector, based in ${emp.city}, Kerala.`,
        isAgentVerified: true,
        paymentStatus: "active",
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    employerProfiles.push(profile);

    // Link employer into agent's assignedEmployerIds
    await Agent.updateOne(
      { _id: agentProfile._id },
      { $addToSet: { assignedEmployerIds: profile._id } }
    );

    console.log(`  ✅ ${emp.company} (${emp.email}) → agent: ${AGENTS[emp.agentIndex].name}`);
  }

  // ── Step 7: Jobs ────────────────────────────────────────────────────────

  console.log("\n📋 Step 7: Jobs…");
  for (const job of JOBS) {
    const empProfile = employerProfiles[job.empIndex];
    const emp = EMPLOYERS[job.empIndex];
    const agentProfile = agentProfiles[emp.agentIndex];

    const created = await Job.findOneAndUpdate(
      { title: job.title, employerId: empProfile._id },
      {
        employerId: empProfile._id,
        agentId: agentProfile._id,
        title: job.title,
        description: `We are hiring a ${job.title} at ${emp.company} in ${job.city}, Kerala. Join our growing team!`,
        requirements: {
          skills: job.skills,
          experienceMin: 1,
          experienceMax: 5,
          languages: ["English", "Malayalam"],
        },
        employmentType: "full_time",
        workMode: "onsite",
        salary: { min: job.salaryMin, max: job.salaryMax, currency: "INR", period: "monthly" },
        location: { country: "India", city: job.city, isRemote: false },
        status: "active",
        visibility: "public",
        vacancies: 2,
        tags: job.tags,
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    // Link job into employer's jobIds
    await Employer.updateOne(
      { _id: empProfile._id },
      { $addToSet: { jobIds: created._id } }
    );

    console.log(`  ✅ "${job.title}" at ${emp.company} (${job.city})`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(70));
  console.log("  🎉  SEED COMPLETE — ALL CREDENTIALS");
  console.log("═".repeat(70));
  console.log(`\n  Password for ALL accounts: ${PASSWORD}\n`);

  console.log("  SUPER AGENTS:");
  for (const sa of SUPER_AGENTS) {
    console.log(`    📧 ${sa.email.padEnd(35)} ${sa.name.padEnd(20)} → ${sa.districts.join(", ")}`);
  }

  console.log("\n  AGENTS:");
  for (const ag of AGENTS) {
    console.log(`    📧 ${ag.email.padEnd(35)} ${ag.name.padEnd(20)} → under ${SUPER_AGENTS[ag.saIndex].name}, ${ag.districts.join(", ")}`);
  }

  console.log("\n  EMPLOYERS:");
  for (const emp of EMPLOYERS) {
    console.log(`    📧 ${emp.email.padEnd(35)} ${emp.company.padEnd(25)} → ${emp.city}`);
  }

  console.log("\n  LOGIN URL: http://localhost:3000/en/login");
  console.log("═".repeat(70) + "\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err.message, err.stack);
  process.exit(1);
});
