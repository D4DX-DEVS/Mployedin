/**
 * Seed the documented subscription catalogue so a fresh environment
 * deterministically has the plans the application expects.
 *
 * Source of truth for the catalogue: docs/SUBSCRIPTION-MODULE-GUIDE.md §3–§4
 * and docs/SUBSCRIPTION-MODULE-PLAN.md §2 (they agree). The Gold / Premium
 * columns are also what src/lib/subscription/gracePeriod.ts hard-codes for
 * users without a plan, so the three stay in lock-step.
 *
 * Usage:
 *   node scripts/seed-subscription-plans.mjs            # create missing plans only
 *   node scripts/seed-subscription-plans.mjs --dry-run  # report, write nothing
 *   node scripts/seed-subscription-plans.mjs --fix-drift    # also overwrite existing
 *                                          catalogue slugs with the documented values
 *   node scripts/seed-subscription-plans.mjs --set-default  # also make the documented
 *                                          Free plan the role default (unsets any other)
 *
 * Behaviour, deliberately conservative:
 *   - Plans are keyed by slug (targetRole + name). A slug that already exists
 *     is NEVER modified — the existing document is reported with any field
 *     drift so an admin can decide. Nothing here overwrites a live plan.
 *   - isDefault is only set on Free when the role has no default plan yet;
 *     an existing default (whatever it is) is left alone and reported.
 *   - createdBy is required by the model; the first admin user is used.
 *
 * Requires MONGODB_URI (from .env / .env.local or the shell).
 */

import mongoose from "mongoose";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  Missing MONGODB_URI environment variable");
  process.exit(1);
}
const DRY_RUN = process.argv.includes("--dry-run");
const FIX_DRIFT = process.argv.includes("--fix-drift");
const SET_DEFAULT = process.argv.includes("--set-default");
/** Documented fields that --fix-drift rewrites on an existing catalogue slug. */
const DRIFT_FIELDS = ["tier", "price", "currency", "billingCycle", "sortOrder", "isActive", "employerLimits", "jobSeekerLimits"];

// ── Minimal schemas (mirror src/models, only what the seed touches) ──────────

const AIFeatureLimitSchema = new mongoose.Schema(
  { feature: String, enabled: Boolean, monthlyLimit: Number },
  { _id: false },
);

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: String,
    slug: { type: String, unique: true },
    targetRole: String,
    tier: Number,
    description: String,
    price: Number,
    currency: String,
    billingCycle: String,
    employerLimits: mongoose.Schema.Types.Mixed,
    jobSeekerLimits: mongoose.Schema.Types.Mixed,
    isActive: Boolean,
    isDefault: Boolean,
    sortOrder: Number,
    createdBy: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: true },
);
void AIFeatureLimitSchema;

const UserSchema = new mongoose.Schema({ role: String, email: String }, { timestamps: true });

const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ?? mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);
const User = mongoose.models.User ?? mongoose.model("User", UserSchema);

// ── Catalogue ───────────────────────────────────────────────────────────────
// -1 = unlimited for numeric caps; monthlyLimit 0 = unlimited when enabled.

const ai = (feature, enabled, monthlyLimit = 0) => ({ feature, enabled, monthlyLimit });

const EMPLOYER_AI = {
  free: [
    ai("ai_chat", false), ai("ai_daily_insights", false), ai("ai_job_matching", false),
    ai("ai_cv_extraction", false), ai("ai_interview_questions", false), ai("ai_skills_gap", false),
    ai("ai_candidate_screening", false), ai("ai_salary_benchmark", false), ai("ai_job_description", false),
    ai("ai_hiring_reports", false), ai("ai_voice_input", false),
  ],
  silver: [
    ai("ai_chat", true, 50), ai("ai_daily_insights", true, 0), ai("ai_job_matching", true, 20),
    ai("ai_cv_extraction", true, 10), ai("ai_interview_questions", true, 10), ai("ai_skills_gap", false),
    ai("ai_candidate_screening", false), ai("ai_salary_benchmark", false), ai("ai_job_description", true, 5),
    ai("ai_hiring_reports", false), ai("ai_voice_input", false),
  ],
  gold: [
    ai("ai_chat", true, 200), ai("ai_daily_insights", true, 0), ai("ai_job_matching", true, 100),
    ai("ai_cv_extraction", true, 50), ai("ai_interview_questions", true, 50), ai("ai_skills_gap", true, 30),
    ai("ai_candidate_screening", true, 30), ai("ai_salary_benchmark", true, 10), ai("ai_job_description", true, 30),
    ai("ai_hiring_reports", true, 5), ai("ai_voice_input", true, 0),
  ],
  platinum: [
    ai("ai_chat", true, 0), ai("ai_daily_insights", true, 0), ai("ai_job_matching", true, 0),
    ai("ai_cv_extraction", true, 0), ai("ai_interview_questions", true, 0), ai("ai_skills_gap", true, 0),
    ai("ai_candidate_screening", true, 0), ai("ai_salary_benchmark", true, 0), ai("ai_job_description", true, 0),
    ai("ai_hiring_reports", true, 0), ai("ai_voice_input", true, 0),
  ],
};

const JOB_SEEKER_AI = {
  free: [
    ai("ai_chat", false), ai("ai_cv_extraction", false), ai("ai_skills_suggest", false), ai("ai_skills_gap", false),
    ai("ai_interview_questions", false), ai("ai_profile_fill", false), ai("ai_enhance_text", false),
    ai("ai_generate_summary", false), ai("ai_daily_insights", false), ai("ai_voice_input", false),
  ],
  premium: [
    ai("ai_chat", true, 30), ai("ai_cv_extraction", true, 3), ai("ai_skills_suggest", true, 10), ai("ai_skills_gap", true, 5),
    ai("ai_interview_questions", true, 10), ai("ai_profile_fill", true, 3), ai("ai_enhance_text", true, 10),
    ai("ai_generate_summary", true, 5), ai("ai_daily_insights", true, 0), ai("ai_voice_input", false),
  ],
  premiumPlus: [
    ai("ai_chat", true, 0), ai("ai_cv_extraction", true, 0), ai("ai_skills_suggest", true, 0), ai("ai_skills_gap", true, 0),
    ai("ai_interview_questions", true, 0), ai("ai_profile_fill", true, 0), ai("ai_enhance_text", true, 0),
    ai("ai_generate_summary", true, 0), ai("ai_daily_insights", true, 0), ai("ai_voice_input", true, 0),
  ],
};

const employer = (name, tier, price, sortOrder, limits, isDefault = false) => ({
  name, targetRole: "employer", tier, price, currency: "AED", billingCycle: "monthly",
  sortOrder, isActive: true, isDefault, employerLimits: limits,
});
const jobSeeker = (name, tier, price, sortOrder, limits, isDefault = false) => ({
  name, targetRole: "job_seeker", tier, price, currency: "AED", billingCycle: "monthly",
  sortOrder, isActive: true, isDefault, jobSeekerLimits: limits,
});

const CATALOGUE = [
  employer("Free", 0, 0, 0, {
    maxActiveJobs: 2, maxApplicationsViewPerMonth: 20, maxTeamMembers: 1, aiFeatures: EMPLOYER_AI.free,
    analyticsLevel: "none", dataExport: false, commTemplates: false, scorecardEvaluations: false,
    matchingWeightCustomization: false, workflowCustomization: false, prioritySupport: false,
    featuredJobListings: 0, brandedCompanyPage: false,
  }, true),
  employer("Silver", 1, 499, 1, {
    maxActiveJobs: 10, maxApplicationsViewPerMonth: 100, maxTeamMembers: 3, aiFeatures: EMPLOYER_AI.silver,
    analyticsLevel: "basic", dataExport: false, commTemplates: true, scorecardEvaluations: false,
    matchingWeightCustomization: false, workflowCustomization: false, prioritySupport: false,
    featuredJobListings: 1, brandedCompanyPage: false,
  }),
  employer("Gold", 2, 1499, 2, {
    maxActiveJobs: 50, maxApplicationsViewPerMonth: 500, maxTeamMembers: 10, aiFeatures: EMPLOYER_AI.gold,
    analyticsLevel: "advanced", dataExport: true, commTemplates: true, scorecardEvaluations: true,
    matchingWeightCustomization: true, workflowCustomization: true, prioritySupport: false,
    featuredJobListings: 5, brandedCompanyPage: true,
  }),
  employer("Platinum", 3, 3999, 3, {
    maxActiveJobs: -1, maxApplicationsViewPerMonth: -1, maxTeamMembers: -1, aiFeatures: EMPLOYER_AI.platinum,
    analyticsLevel: "advanced", dataExport: true, commTemplates: true, scorecardEvaluations: true,
    matchingWeightCustomization: true, workflowCustomization: true, prioritySupport: true,
    featuredJobListings: -1, brandedCompanyPage: true,
  }),
  jobSeeker("Free", 0, 0, 0, {
    maxApplicationsPerMonth: 10, aiFeatures: JOB_SEEKER_AI.free,
    profileVisibilityBoost: false, salaryInsights: false, priorityApplicationReview: false, resumeBuilderAccess: false,
  }, true),
  jobSeeker("Premium", 1, 49, 1, {
    maxApplicationsPerMonth: 50, aiFeatures: JOB_SEEKER_AI.premium,
    profileVisibilityBoost: true, salaryInsights: true, priorityApplicationReview: false, resumeBuilderAccess: true,
  }),
  jobSeeker("Premium Plus", 2, 99, 2, {
    maxApplicationsPerMonth: -1, aiFeatures: JOB_SEEKER_AI.premiumPlus,
    profileVisibilityBoost: true, salaryInsights: true, priorityApplicationReview: true, resumeBuilderAccess: true,
  }),
];

// Same rule as SubscriptionPlan's pre-validate hook.
const slugOf = (p) => `${p.targetRole}_${p.name}`.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`${DRY_RUN ? "🔍  DRY RUN — " : ""}Seeding subscription catalogue (${CATALOGUE.length} plans)\n`);

  const admin = await User.findOne({ role: "admin" }).select("_id email").lean();
  if (!admin) {
    console.error("❌  No admin user found — SubscriptionPlan.createdBy is required. Create an admin first.");
    process.exit(1);
  }

  const existingDefaults = {};
  for (const role of ["employer", "job_seeker"]) {
    const d = await SubscriptionPlan.findOne({ targetRole: role, isDefault: true }).select("name slug isActive").lean();
    existingDefaults[role] = d ?? null;
    if (d) console.log(`ℹ️   ${role} already has a default plan: "${d.name}" (${d.slug}${d.isActive ? "" : ", INACTIVE"}) — left unchanged`);
  }

  let created = 0, skipped = 0, fixed = 0;
  for (const plan of CATALOGUE) {
    const slug = slugOf(plan);
    const existing = await SubscriptionPlan.findOne({ slug }).lean();

    if (existing) {
      const drift = [];
      for (const k of DRIFT_FIELDS) {
        if (plan[k] === undefined) continue;
        if (JSON.stringify(existing[k]) !== JSON.stringify(plan[k])) {
          const short = (v) => (typeof v === "object" && v !== null ? "{…limits}" : JSON.stringify(v));
          drift.push(`${k}: ${short(existing[k])} → doc says ${short(plan[k])}`);
        }
      }
      if (FIX_DRIFT && drift.length) {
        const patch = Object.fromEntries(DRIFT_FIELDS.filter((k) => plan[k] !== undefined).map((k) => [k, plan[k]]));
        if (DRY_RUN) {
          console.log(`✏️   would rewrite ${slug} to the documented catalogue: ${drift.join("; ")}`);
        } else {
          await SubscriptionPlan.updateOne({ _id: existing._id }, { $set: patch });
          console.log(`✏️   rewrote ${slug} to the documented catalogue: ${drift.join("; ")}`);
        }
        fixed++;
        continue;
      }
      skipped++;
      console.log(`⏭️   ${slug} exists — not modified${drift.length ? `\n      drift vs documented catalogue: ${drift.join("; ")}` : ""}`);
      continue;
    }

    const isDefault = plan.isDefault && !existingDefaults[plan.targetRole];
    const doc = { ...plan, slug, isDefault, createdBy: admin._id };
    if (DRY_RUN) {
      console.log(`➕  would create ${slug} (tier ${plan.tier}, ${plan.price} ${plan.currency}${isDefault ? ", default" : ""})`);
    } else {
      await SubscriptionPlan.create(doc);
      console.log(`✅  created ${slug} (tier ${plan.tier}, ${plan.price} ${plan.currency}${isDefault ? ", default" : ""})`);
    }
    if (isDefault) existingDefaults[plan.targetRole] = { name: plan.name, slug };
    created++;
  }

  for (const role of ["employer", "job_seeker"]) {
    if (!existingDefaults[role]) {
      console.warn(`⚠️   ${role} still has no default plan — registration auto-assign will skip this role.`);
    }
  }

  if (SET_DEFAULT) {
    for (const plan of CATALOGUE.filter((p) => p.isDefault)) {
      const slug = slugOf(plan);
      const target = await SubscriptionPlan.findOne({ slug }).select("_id isDefault isActive").lean();
      if (!target) { console.log(`⚠️   ${slug} not found — cannot set as ${plan.targetRole} default`); continue; }
      const others = await SubscriptionPlan.find({ targetRole: plan.targetRole, isDefault: true, _id: { $ne: target._id } }).select("name slug").lean();
      if (target.isDefault && others.length === 0) { console.log(`ℹ️   ${slug} is already the ${plan.targetRole} default`); continue; }
      if (DRY_RUN) {
        console.log(`⭐  would make ${slug} the ${plan.targetRole} default${others.length ? ` (unsetting ${others.map((o) => o.slug).join(", ")})` : ""}`);
        continue;
      }
      // One default per role (partial unique index): unset the others first, then set.
      if (others.length) await SubscriptionPlan.updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { isDefault: false } });
      await SubscriptionPlan.updateOne({ _id: target._id }, { $set: { isDefault: true, isActive: true } });
      console.log(`⭐  ${slug} is now the ${plan.targetRole} default${others.length ? ` (unset ${others.map((o) => o.slug).join(", ")})` : ""}`);
    }
  }

  console.log(`\n${DRY_RUN ? "Would create" : "Created"} ${created}, rewrote ${fixed}, left ${skipped} existing untouched.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
