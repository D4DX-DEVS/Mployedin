/**
 * One-time migration: assign the default (Free) plan to all employers and
 * job seekers who don't already have an active subscription.
 *
 * Usage:
 *   node scripts/backfill-free-subscriptions.mjs
 *
 * Requires MONGODB_URI env variable (set in .env.local or shell).
 */

import mongoose from "mongoose";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  Missing MONGODB_URI environment variable");
  process.exit(1);
}

// ── Minimal schemas ─────────────────────────────────────────────────────────

const AIFeatureLimitSchema = new mongoose.Schema(
  { feature: String, enabled: Boolean, monthlyLimit: Number },
  { _id: false },
);

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: String,
    slug: String,
    targetRole: String,
    tier: Number,
    price: Number,
    currency: String,
    billingCycle: String,
    isDefault: Boolean,
    isActive: Boolean,
    employerLimits: mongoose.Schema.Types.Mixed,
    jobSeekerLimits: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    targetRole: String,
    planId: mongoose.Schema.Types.ObjectId,
    planSnapshot: mongoose.Schema.Types.Mixed,
    status: String,
    startDate: Date,
    endDate: Date,
    autoRenew: Boolean,
    usage: mongoose.Schema.Types.Mixed,
    usageResetAt: Date,
    assignedBy: mongoose.Schema.Types.ObjectId,
    assignedByRole: String,
    notes: String,
  },
  { timestamps: true },
);

const SubscriptionHistorySchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    subscriptionId: mongoose.Schema.Types.ObjectId,
    action: String,
    toPlanId: mongoose.Schema.Types.ObjectId,
    toPlanName: String,
    performedBy: mongoose.Schema.Types.ObjectId,
    performedByRole: String,
    reason: String,
  },
  { timestamps: true },
);

const UserSchema = new mongoose.Schema(
  { role: String },
  { timestamps: true },
);

// ── Model registration ───────────────────────────────────────────────────────

const SubscriptionPlan = mongoose.models.SubscriptionPlan
  ?? mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);
const Subscription = mongoose.models.Subscription
  ?? mongoose.model("Subscription", SubscriptionSchema);
const SubscriptionHistory = mongoose.models.SubscriptionHistory
  ?? mongoose.model("SubscriptionHistory", SubscriptionHistorySchema);
const User = mongoose.models.User ?? mongoose.model("User", UserSchema);

// ── Helpers ─────────────────────────────────────────────────────────────────

const CYCLE_MS = {
  monthly:   30  * 24 * 60 * 60 * 1000,
  quarterly: 91  * 24 * 60 * 60 * 1000,
  yearly:    365 * 24 * 60 * 60 * 1000,
};

function calcEndDate(startDate, billingCycle) {
  const ms = CYCLE_MS[billingCycle] ?? CYCLE_MS.monthly;
  return new Date(startDate.getTime() + ms);
}

function nextUsageReset(from) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function initAiUsage() {
  const keys = [
    "ai_chat", "ai_daily_insights", "ai_job_matching", "ai_cv_extraction",
    "ai_interview_questions", "ai_skills_gap", "ai_candidate_screening",
    "ai_salary_benchmark", "ai_job_description", "ai_hiring_reports",
    "ai_voice_input", "ai_skills_suggest", "ai_profile_fill",
    "ai_enhance_text", "ai_generate_summary",
  ];
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

function buildPlanSnapshot(plan) {
  return {
    name: plan.name,
    tier: plan.tier,
    price: plan.price,
    currency: plan.currency,
    billingCycle: plan.billingCycle,
    employerLimits: plan.employerLimits
      ? JSON.parse(JSON.stringify(plan.employerLimits))
      : undefined,
    jobSeekerLimits: plan.jobSeekerLimits
      ? JSON.parse(JSON.stringify(plan.jobSeekerLimits))
      : undefined,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function backfillRole(targetRole) {
  const plan = await SubscriptionPlan.findOne({
    targetRole,
    isDefault: true,
    isActive: true,
  }).lean();

  if (!plan) {
    console.warn(`⚠️   No default plan found for role: ${targetRole}. Skipping.`);
    return 0;
  }

  console.log(`📋  Default plan for ${targetRole}: "${plan.name}" (tier ${plan.tier})`);

  // Find all users with this role
  const users = await User.find({ role: targetRole }, { _id: 1 }).lean();
  if (!users.length) {
    console.log(`   No ${targetRole} users found.`);
    return 0;
  }

  // Find users who already have an active subscription
  const activeUserIds = await Subscription.distinct("userId", {
    targetRole,
    status: "active",
  });
  const activeSet = new Set(activeUserIds.map(String));

  const toBackfill = users.filter((u) => !activeSet.has(String(u._id)));
  console.log(
    `   ${users.length} total users, ${activeSet.size} already subscribed, ${toBackfill.length} to backfill`,
  );

  if (!toBackfill.length) return 0;

  let created = 0;
  for (const user of toBackfill) {
    try {
      const startDate = new Date();
      const endDate = calcEndDate(startDate, plan.billingCycle);

      const subscription = await Subscription.create({
        userId: user._id,
        targetRole,
        planId: plan._id,
        planSnapshot: buildPlanSnapshot(plan),
        status: "active",
        startDate,
        endDate,
        autoRenew: true,
        usage: {
          activeJobs: 0,
          applicationsViewed: 0,
          applicationsSubmitted: 0,
          aiUsage: initAiUsage(),
        },
        usageResetAt: nextUsageReset(startDate),
        assignedBy: user._id,
        assignedByRole: "system",
        notes: "Backfilled free plan — migration script",
      });

      await SubscriptionHistory.create({
        userId: user._id,
        subscriptionId: subscription._id,
        action: "assigned",
        toPlanId: plan._id,
        toPlanName: plan.name,
        performedBy: user._id,
        performedByRole: "system",
        reason: "Backfilled free plan — migration script",
      });

      created++;
    } catch (err) {
      console.error(`   ❌  Failed for user ${user._id}:`, err.message);
    }
  }

  return created;
}

async function main() {
  console.log("🔗  Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅  Connected\n");

  const employerCount   = await backfillRole("employer");
  const jobSeekerCount  = await backfillRole("job_seeker");

  console.log(`\n🎉  Done. Backfilled ${employerCount} employers and ${jobSeekerCount} job seekers.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
