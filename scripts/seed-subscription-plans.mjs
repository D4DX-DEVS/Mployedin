/**
 * Seed default subscription plans for employers and job seekers.
 *
 * Usage:
 *   node --experimental-modules scripts/seed-subscription-plans.mjs
 *
 * Requires MONGODB_URI env variable.
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable");
  process.exit(1);
}

// ── AI Feature Keys ─────────────────────────────────────────────────────────
const AI_FEATURE_KEYS = [
  "ai_chat", "ai_daily_insights", "ai_job_matching", "ai_cv_extraction",
  "ai_interview_questions", "ai_skills_gap", "ai_candidate_screening",
  "ai_salary_benchmark", "ai_job_description", "ai_hiring_reports",
  "ai_voice_input", "ai_skills_suggest", "ai_profile_fill",
  "ai_enhance_text", "ai_generate_summary",
];

function aiFeatures(overrides = {}) {
  return AI_FEATURE_KEYS.map((feature) => ({
    feature,
    enabled: overrides[feature]?.enabled ?? false,
    monthlyLimit: overrides[feature]?.monthlyLimit ?? 0,
  }));
}

// ── Schema ──────────────────────────────────────────────────────────────────
const AIFeatureLimitSchema = new mongoose.Schema(
  { feature: String, enabled: Boolean, monthlyLimit: Number },
  { _id: false },
);

const EmployerLimitsSchema = new mongoose.Schema(
  {
    maxActiveJobs: Number, maxApplicationsViewPerMonth: Number, maxTeamMembers: Number,
    aiFeatures: [AIFeatureLimitSchema], analyticsLevel: String,
    dataExport: Boolean, commTemplates: Boolean, scorecardEvaluations: Boolean,
    matchingWeightCustomization: Boolean, workflowCustomization: Boolean,
    prioritySupport: Boolean, featuredJobListings: Number, brandedCompanyPage: Boolean,
  },
  { _id: false },
);

const JobSeekerLimitsSchema = new mongoose.Schema(
  {
    maxApplicationsPerMonth: Number, aiFeatures: [AIFeatureLimitSchema],
    profileVisibilityBoost: Boolean, salaryInsights: Boolean,
    priorityApplicationReview: Boolean, resumeBuilderAccess: Boolean,
  },
  { _id: false },
);

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: String, slug: { type: String, unique: true }, targetRole: String,
    tier: Number, description: String, price: Number, currency: String,
    billingCycle: String, employerLimits: EmployerLimitsSchema,
    jobSeekerLimits: JobSeekerLimitsSchema, isActive: Boolean,
    isDefault: Boolean, sortOrder: Number, createdBy: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: true },
);

const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ||
  mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);

// ── Employer Plans ──────────────────────────────────────────────────────────

const EMPLOYER_PLANS = [
  {
    name: "Free",
    slug: "employer_free",
    targetRole: "employer",
    tier: 0,
    description: "Get started with basic features — no cost",
    price: 0,
    currency: "AED",
    billingCycle: "monthly",
    isActive: true,
    isDefault: true,
    sortOrder: 0,
    employerLimits: {
      maxActiveJobs: 2,
      maxApplicationsViewPerMonth: 20,
      maxTeamMembers: 1,
      aiFeatures: aiFeatures(),
      analyticsLevel: "none",
      dataExport: false,
      commTemplates: false,
      scorecardEvaluations: false,
      matchingWeightCustomization: false,
      workflowCustomization: false,
      prioritySupport: false,
      featuredJobListings: 0,
      brandedCompanyPage: false,
    },
  },
  {
    name: "Silver",
    slug: "employer_silver",
    targetRole: "employer",
    tier: 1,
    description: "Essential hiring tools for growing companies",
    price: 499,
    currency: "AED",
    billingCycle: "monthly",
    isActive: true,
    isDefault: false,
    sortOrder: 1,
    employerLimits: {
      maxActiveJobs: 10,
      maxApplicationsViewPerMonth: 100,
      maxTeamMembers: 3,
      aiFeatures: aiFeatures({
        ai_chat: { enabled: true, monthlyLimit: 50 },
        ai_daily_insights: { enabled: true, monthlyLimit: 0 },
        ai_job_matching: { enabled: true, monthlyLimit: 20 },
        ai_cv_extraction: { enabled: true, monthlyLimit: 10 },
        ai_interview_questions: { enabled: true, monthlyLimit: 10 },
        ai_job_description: { enabled: true, monthlyLimit: 5 },
      }),
      analyticsLevel: "basic",
      dataExport: false,
      commTemplates: true,
      scorecardEvaluations: false,
      matchingWeightCustomization: false,
      workflowCustomization: false,
      prioritySupport: false,
      featuredJobListings: 1,
      brandedCompanyPage: false,
    },
  },
  {
    name: "Gold",
    slug: "employer_gold",
    targetRole: "employer",
    tier: 2,
    description: "Advanced features for professional recruitment teams",
    price: 1499,
    currency: "AED",
    billingCycle: "monthly",
    isActive: true,
    isDefault: false,
    sortOrder: 2,
    employerLimits: {
      maxActiveJobs: 50,
      maxApplicationsViewPerMonth: 500,
      maxTeamMembers: 10,
      aiFeatures: aiFeatures({
        ai_chat: { enabled: true, monthlyLimit: 200 },
        ai_daily_insights: { enabled: true, monthlyLimit: 0 },
        ai_job_matching: { enabled: true, monthlyLimit: 100 },
        ai_cv_extraction: { enabled: true, monthlyLimit: 50 },
        ai_interview_questions: { enabled: true, monthlyLimit: 50 },
        ai_skills_gap: { enabled: true, monthlyLimit: 30 },
        ai_candidate_screening: { enabled: true, monthlyLimit: 30 },
        ai_salary_benchmark: { enabled: true, monthlyLimit: 10 },
        ai_job_description: { enabled: true, monthlyLimit: 30 },
        ai_hiring_reports: { enabled: true, monthlyLimit: 5 },
        ai_voice_input: { enabled: true, monthlyLimit: 0 },
      }),
      analyticsLevel: "advanced",
      dataExport: true,
      commTemplates: true,
      scorecardEvaluations: true,
      matchingWeightCustomization: true,
      workflowCustomization: true,
      prioritySupport: false,
      featuredJobListings: 5,
      brandedCompanyPage: true,
    },
  },
  {
    name: "Platinum",
    slug: "employer_platinum",
    targetRole: "employer",
    tier: 3,
    description: "Unlimited access with priority support — enterprise grade",
    price: 3999,
    currency: "AED",
    billingCycle: "monthly",
    isActive: true,
    isDefault: false,
    sortOrder: 3,
    employerLimits: {
      maxActiveJobs: -1,
      maxApplicationsViewPerMonth: -1,
      maxTeamMembers: -1,
      aiFeatures: aiFeatures(
        Object.fromEntries(
          AI_FEATURE_KEYS.map((k) => [k, { enabled: true, monthlyLimit: 0 }]),
        ),
      ),
      analyticsLevel: "advanced",
      dataExport: true,
      commTemplates: true,
      scorecardEvaluations: true,
      matchingWeightCustomization: true,
      workflowCustomization: true,
      prioritySupport: true,
      featuredJobListings: -1,
      brandedCompanyPage: true,
    },
  },
];

// ── Job Seeker Plans ────────────────────────────────────────────────────────

const JOB_SEEKER_PLANS = [
  {
    name: "Free",
    slug: "job_seeker_free",
    targetRole: "job_seeker",
    tier: 0,
    description: "Basic job search features",
    price: 0,
    currency: "AED",
    billingCycle: "monthly",
    isActive: true,
    isDefault: true,
    sortOrder: 0,
    jobSeekerLimits: {
      maxApplicationsPerMonth: 10,
      aiFeatures: aiFeatures(),
      profileVisibilityBoost: false,
      salaryInsights: false,
      priorityApplicationReview: false,
      resumeBuilderAccess: false,
    },
  },
  {
    name: "Premium",
    slug: "job_seeker_premium",
    targetRole: "job_seeker",
    tier: 1,
    description: "Stand out with AI-powered career tools",
    price: 49,
    currency: "AED",
    billingCycle: "monthly",
    isActive: true,
    isDefault: false,
    sortOrder: 1,
    jobSeekerLimits: {
      maxApplicationsPerMonth: 50,
      aiFeatures: aiFeatures({
        ai_chat: { enabled: true, monthlyLimit: 30 },
        ai_cv_extraction: { enabled: true, monthlyLimit: 3 },
        ai_skills_suggest: { enabled: true, monthlyLimit: 10 },
        ai_skills_gap: { enabled: true, monthlyLimit: 5 },
        ai_interview_questions: { enabled: true, monthlyLimit: 10 },
        ai_profile_fill: { enabled: true, monthlyLimit: 3 },
        ai_enhance_text: { enabled: true, monthlyLimit: 10 },
        ai_generate_summary: { enabled: true, monthlyLimit: 5 },
        ai_daily_insights: { enabled: true, monthlyLimit: 0 },
      }),
      profileVisibilityBoost: true,
      salaryInsights: true,
      priorityApplicationReview: false,
      resumeBuilderAccess: true,
    },
  },
  {
    name: "Premium Plus",
    slug: "job_seeker_premium_plus",
    targetRole: "job_seeker",
    tier: 2,
    description: "Maximum visibility and unlimited AI access",
    price: 99,
    currency: "AED",
    billingCycle: "monthly",
    isActive: true,
    isDefault: false,
    sortOrder: 2,
    jobSeekerLimits: {
      maxApplicationsPerMonth: -1,
      aiFeatures: aiFeatures(
        Object.fromEntries(
          AI_FEATURE_KEYS.map((k) => [k, { enabled: true, monthlyLimit: 0 }]),
        ),
      ),
      profileVisibilityBoost: true,
      salaryInsights: true,
      priorityApplicationReview: true,
      resumeBuilderAccess: true,
    },
  },
];

// ── Seed Runner ─────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const allPlans = [...EMPLOYER_PLANS, ...JOB_SEEKER_PLANS];
  let created = 0;
  let skipped = 0;

  for (const plan of allPlans) {
    const existing = await SubscriptionPlan.findOne({ slug: plan.slug });
    if (existing) {
      console.log(`  ⏭ ${plan.slug} already exists — skipping`);
      skipped++;
      continue;
    }
    await SubscriptionPlan.create(plan);
    console.log(`  ✅ Created: ${plan.slug}`);
    created++;
  }

  console.log(`\nDone — created: ${created}, skipped: ${skipped}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
