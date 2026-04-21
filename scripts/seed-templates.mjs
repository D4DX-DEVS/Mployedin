/**
 * Seed default workflow and matching weight templates.
 *
 * Usage:
 *   node --experimental-modules scripts/seed-templates.mjs
 *
 * Requires MONGODB_URI env variable.
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable");
  process.exit(1);
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const WorkflowStageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    autoProgress: { type: Boolean, default: false },
    order: { type: Number, required: true },
  },
  { _id: false },
);

const WorkflowTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    scope: { type: String, enum: ["system", "employer"], required: true },
    employerId: mongoose.Schema.Types.ObjectId,
    stages: [WorkflowStageSchema],
    settings: {
      aiAutoScreen: { type: Boolean, default: true },
      notifyOnStageChange: { type: Boolean, default: true },
      autoRejectBelow: { type: Number, default: 40 },
    },
    tags: [String],
    isDefault: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

const MatchingWeightTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    scope: { type: String, enum: ["system", "employer"], required: true },
    employerId: mongoose.Schema.Types.ObjectId,
    weights: {
      skills: { type: Number, required: true },
      experience: { type: Number, required: true },
      education: { type: Number, required: true },
      location: { type: Number, required: true },
      salary: { type: Number, required: true },
      languages: { type: Number, required: true },
      availability: { type: Number, required: true },
      behaviorSignals: { type: Number, required: true },
    },
    tags: [String],
    isDefault: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

const WorkflowTemplate = mongoose.model("WorkflowTemplate", WorkflowTemplateSchema);
const MatchingWeightTemplate = mongoose.model("MatchingWeightTemplate", MatchingWeightTemplateSchema);

// ── Default Templates ───────────────────────────────────────────────────────

// Use a placeholder admin ObjectId — replace with a real admin user _id in production
const SYSTEM_USER_ID = new mongoose.Types.ObjectId("000000000000000000000001");

const standardStages = [
  { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
  { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
  { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
  { id: "interview_scheduled", label: "Interview Scheduled", enabled: true, autoProgress: true, order: 4 },
  { id: "interview_completed", label: "Interview Completed", enabled: true, autoProgress: false, order: 5 },
  { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 6 },
  { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 7 },
  { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 8 },
];

const WORKFLOW_TEMPLATES = [
  {
    name: "Standard Hiring Pipeline",
    description: "Default 8-stage workflow with AI screening. Suitable for most roles.",
    stages: standardStages,
    settings: { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 40 },
    tags: ["general", "default"],
    isDefault: true,
  },
  {
    name: "Tech Engineering Pipeline",
    description: "Includes technical assessment and coding test stages for engineering roles.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
      { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
      { id: "coding_test", label: "Coding Test", enabled: true, autoProgress: false, order: 4 },
      { id: "technical_interview", label: "Technical Interview", enabled: true, autoProgress: false, order: 5 },
      { id: "culture_fit", label: "Culture Fit Interview", enabled: true, autoProgress: false, order: 6 },
      { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 7 },
      { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 8 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 9 },
    ],
    settings: { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 50 },
    tags: ["tech", "engineering", "software"],
  },
  {
    name: "Sales & Business Development",
    description: "Fast-track pipeline with role-play assessment for sales positions.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
      { id: "phone_screen", label: "Phone Screening", enabled: true, autoProgress: false, order: 3 },
      { id: "sales_assessment", label: "Sales Role-Play", enabled: true, autoProgress: false, order: 4 },
      { id: "manager_interview", label: "Manager Interview", enabled: true, autoProgress: false, order: 5 },
      { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 6 },
      { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 7 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 8 },
    ],
    settings: { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 35 },
    tags: ["sales", "business development"],
  },
  {
    name: "Executive Hiring",
    description: "Multi-round interview process for C-level and VP positions.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
      { id: "recruiter_screen", label: "Recruiter Screen", enabled: true, autoProgress: false, order: 3 },
      { id: "panel_interview_1", label: "Panel Interview Round 1", enabled: true, autoProgress: false, order: 4 },
      { id: "panel_interview_2", label: "Panel Interview Round 2", enabled: true, autoProgress: false, order: 5 },
      { id: "board_review", label: "Board Review", enabled: true, autoProgress: false, order: 6 },
      { id: "reference_check", label: "Reference Check", enabled: true, autoProgress: false, order: 7 },
      { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 8 },
      { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 9 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 10 },
    ],
    settings: { aiAutoScreen: false, notifyOnStageChange: true, autoRejectBelow: 30 },
    tags: ["executive", "leadership", "c-level"],
  },
  {
    name: "Internship Fast-Track",
    description: "Lightweight 5-stage pipeline for intern and entry-level hires.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
      { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
      { id: "interview", label: "Interview", enabled: true, autoProgress: false, order: 4 },
      { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 5 },
      { id: "accepted", label: "Accepted", enabled: true, autoProgress: false, order: 6 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 7 },
    ],
    settings: { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 30 },
    tags: ["internship", "entry-level", "campus"],
  },
  {
    name: "Healthcare & Medical",
    description: "Includes credential verification and background check stages.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
      { id: "credential_check", label: "Credential Verification", enabled: true, autoProgress: false, order: 3 },
      { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 4 },
      { id: "interview", label: "Interview", enabled: true, autoProgress: false, order: 5 },
      { id: "background_check", label: "Background Check", enabled: true, autoProgress: false, order: 6 },
      { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 7 },
      { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 8 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 9 },
    ],
    settings: { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 45 },
    tags: ["healthcare", "medical", "nursing"],
  },
  {
    name: "Retail & Hospitality",
    description: "Quick-hire pipeline for high-volume retail and hospitality positions.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "screening", label: "Quick Screen", enabled: true, autoProgress: true, order: 2 },
      { id: "phone_screen", label: "Phone Screen", enabled: true, autoProgress: false, order: 3 },
      { id: "in_person", label: "In-Person Interview", enabled: true, autoProgress: false, order: 4 },
      { id: "offer_extended", label: "Offer", enabled: true, autoProgress: false, order: 5 },
      { id: "accepted", label: "Accepted", enabled: true, autoProgress: false, order: 6 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 7 },
    ],
    settings: { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 25 },
    tags: ["retail", "hospitality", "high-volume"],
  },
  {
    name: "Remote-First Hiring",
    description: "Async-friendly pipeline with video assessment and timezone check.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
      { id: "video_assessment", label: "Video Assessment", enabled: true, autoProgress: false, order: 3 },
      { id: "async_task", label: "Take-Home Task", enabled: true, autoProgress: false, order: 4 },
      { id: "live_interview", label: "Live Interview", enabled: true, autoProgress: false, order: 5 },
      { id: "timezone_check", label: "Timezone & Logistics", enabled: true, autoProgress: false, order: 6 },
      { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 7 },
      { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 8 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 9 },
    ],
    settings: { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 40 },
    tags: ["remote", "distributed", "async"],
  },
  {
    name: "Contract & Freelance",
    description: "Simplified pipeline for contract, freelance, and project-based hires.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "screening", label: "Portfolio Review", enabled: true, autoProgress: false, order: 2 },
      { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
      { id: "interview", label: "Brief Interview", enabled: true, autoProgress: false, order: 4 },
      { id: "offer_extended", label: "Contract Offered", enabled: true, autoProgress: false, order: 5 },
      { id: "accepted", label: "Accepted", enabled: true, autoProgress: false, order: 6 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 7 },
    ],
    settings: { aiAutoScreen: false, notifyOnStageChange: true, autoRejectBelow: 30 },
    tags: ["contract", "freelance", "project"],
  },
  {
    name: "Government & Public Sector",
    description: "Compliance-heavy pipeline with security clearance and documentation stages.",
    stages: [
      { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
      { id: "eligibility_check", label: "Eligibility Check", enabled: true, autoProgress: true, order: 2 },
      { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
      { id: "written_test", label: "Written Exam", enabled: true, autoProgress: false, order: 4 },
      { id: "interview", label: "Interview Panel", enabled: true, autoProgress: false, order: 5 },
      { id: "security_clearance", label: "Security Clearance", enabled: true, autoProgress: false, order: 6 },
      { id: "document_verification", label: "Document Verification", enabled: true, autoProgress: false, order: 7 },
      { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 8 },
      { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 9 },
      { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 10 },
    ],
    settings: { aiAutoScreen: false, notifyOnStageChange: true, autoRejectBelow: 50 },
    tags: ["government", "public sector", "compliance"],
  },
];

const MATCHING_WEIGHT_TEMPLATES = [
  {
    name: "Balanced Default",
    description: "Well-rounded scoring for general positions. Skills and experience lead.",
    weights: { skills: 27, experience: 23, education: 13, location: 9, salary: 9, languages: 5, availability: 4, behaviorSignals: 10 },
    tags: ["general", "default"],
    isDefault: true,
  },
  {
    name: "Skills-Heavy (Tech)",
    description: "Prioritizes technical skills match for engineering and developer roles.",
    weights: { skills: 35, experience: 20, education: 8, location: 5, salary: 8, languages: 4, availability: 5, behaviorSignals: 15 },
    tags: ["tech", "engineering", "software"],
  },
  {
    name: "Experience-First (Senior)",
    description: "Emphasizes years of experience for senior and leadership positions.",
    weights: { skills: 20, experience: 35, education: 10, location: 7, salary: 8, languages: 5, availability: 5, behaviorSignals: 10 },
    tags: ["senior", "leadership", "management"],
  },
  {
    name: "Education-Focused (Academic)",
    description: "Weights education heavily for research, academic, and medical roles.",
    weights: { skills: 18, experience: 15, education: 30, location: 5, salary: 7, languages: 10, availability: 5, behaviorSignals: 10 },
    tags: ["academic", "research", "medical"],
  },
  {
    name: "Location-Priority (On-site)",
    description: "Location match is critical for on-site and field roles.",
    weights: { skills: 22, experience: 18, education: 10, location: 25, salary: 8, languages: 5, availability: 4, behaviorSignals: 8 },
    tags: ["onsite", "field", "local"],
  },
  {
    name: "Culture Fit (Startup)",
    description: "High weight on behavior signals and culture fit for startup environments.",
    weights: { skills: 22, experience: 15, education: 5, location: 8, salary: 8, languages: 5, availability: 7, behaviorSignals: 30 },
    tags: ["startup", "culture", "team-fit"],
  },
  {
    name: "Language-Critical (International)",
    description: "For roles requiring specific language proficiency, like translation or international sales.",
    weights: { skills: 20, experience: 15, education: 10, location: 8, salary: 7, languages: 25, availability: 5, behaviorSignals: 10 },
    tags: ["international", "multilingual", "translation"],
  },
  {
    name: "Fast-Hire (High Volume)",
    description: "Availability and basic skills matter most for quick-fill positions.",
    weights: { skills: 20, experience: 15, education: 5, location: 10, salary: 10, languages: 5, availability: 25, behaviorSignals: 10 },
    tags: ["high-volume", "retail", "hospitality"],
  },
  {
    name: "Salary-Sensitive (Budget Roles)",
    description: "When budget is a hard constraint and salary alignment is critical.",
    weights: { skills: 22, experience: 18, education: 10, location: 8, salary: 25, languages: 5, availability: 4, behaviorSignals: 8 },
    tags: ["budget", "cost-sensitive"],
  },
  {
    name: "Remote-Optimized",
    description: "For distributed teams — languages, availability, and behavior signals get higher weight.",
    weights: { skills: 25, experience: 18, education: 8, location: 3, salary: 8, languages: 12, availability: 12, behaviorSignals: 14 },
    tags: ["remote", "distributed", "async"],
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  // Check if templates already exist
  const existingWorkflows = await WorkflowTemplate.countDocuments({ scope: "system" });
  const existingWeights = await MatchingWeightTemplate.countDocuments({ scope: "system" });

  if (existingWorkflows > 0 || existingWeights > 0) {
    console.log(`Found ${existingWorkflows} workflow templates and ${existingWeights} weight templates.`);
    console.log("Skipping seed to avoid duplicates. Delete existing system templates first to re-seed.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log("Seeding workflow templates...");
  for (const wt of WORKFLOW_TEMPLATES) {
    await WorkflowTemplate.create({
      ...wt,
      scope: "system",
      createdBy: SYSTEM_USER_ID,
    });
    console.log(`  ✓ ${wt.name}`);
  }

  console.log("Seeding matching weight templates...");
  for (const mwt of MATCHING_WEIGHT_TEMPLATES) {
    await MatchingWeightTemplate.create({
      ...mwt,
      scope: "system",
      createdBy: SYSTEM_USER_ID,
    });
    console.log(`  ✓ ${mwt.name}`);
  }

  console.log(`\nDone! Seeded ${WORKFLOW_TEMPLATES.length} workflow templates and ${MATCHING_WEIGHT_TEMPLATES.length} matching weight templates.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
