/**
 * Grace Period Logic
 *
 * For users without a subscription, provide a 30-day grace period
 * with Gold-tier access. After 30 days, feature gates block them.
 *
 * This prevents existing users from being locked out on deploy.
 */

import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";

/** Grace period duration: 30 days from user creation. */
const GRACE_PERIOD_DAYS = 30;

/**
 * Check if a user is within the grace period (30 days from account creation).
 * Returns true if user has no subscription AND was created within 30 days.
 */
export async function isInGracePeriod(userId: string): Promise<boolean> {
  try {
    await connectDB();
    const user = await User.findById(userId).select("createdAt").lean();
    if (!user?.createdAt) return false;

    const createdAt = new Date(user.createdAt as Date);
    const graceCutoff = new Date(createdAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    return Date.now() < graceCutoff.getTime();
  } catch {
    // Invalid ObjectId or DB error — not in grace period
    return false;
  }
}

/**
 * Build a Gold-tier employer plan snapshot for grace period users.
 * Matches the employer_gold seed plan limits.
 */
export function getGracePeriodEmployerLimits() {
  return {
    maxActiveJobs: 50,
    maxApplicationsViewPerMonth: 500,
    maxTeamMembers: 10,
    aiFeatures: [
      { feature: "ai_chat", enabled: true, monthlyLimit: 200 },
      { feature: "ai_daily_insights", enabled: true, monthlyLimit: 0 },
      { feature: "ai_job_matching", enabled: true, monthlyLimit: 100 },
      { feature: "ai_cv_extraction", enabled: true, monthlyLimit: 50 },
      { feature: "ai_interview_questions", enabled: true, monthlyLimit: 50 },
      { feature: "ai_skills_gap", enabled: true, monthlyLimit: 30 },
      { feature: "ai_candidate_screening", enabled: true, monthlyLimit: 30 },
      { feature: "ai_salary_benchmark", enabled: true, monthlyLimit: 10 },
      { feature: "ai_job_description", enabled: true, monthlyLimit: 30 },
      { feature: "ai_hiring_reports", enabled: true, monthlyLimit: 5 },
      { feature: "ai_voice_input", enabled: true, monthlyLimit: 0 },
      { feature: "ai_skills_suggest", enabled: false, monthlyLimit: 0 },
      { feature: "ai_profile_fill", enabled: false, monthlyLimit: 0 },
      { feature: "ai_enhance_text", enabled: false, monthlyLimit: 0 },
      { feature: "ai_generate_summary", enabled: false, monthlyLimit: 0 },
    ],
    analyticsLevel: "advanced" as const,
    dataExport: true,
    commTemplates: true,
    scorecardEvaluations: true,
    matchingWeightCustomization: true,
    workflowCustomization: true,
    prioritySupport: false,
    featuredJobListings: 5,
    brandedCompanyPage: true,
  };
}

/**
 * Build a Premium job-seeker plan snapshot for grace period users.
 * Matches the job_seeker_premium seed plan limits.
 */
export function getGracePeriodJobSeekerLimits() {
  return {
    maxApplicationsPerMonth: 50,
    aiFeatures: [
      { feature: "ai_chat", enabled: true, monthlyLimit: 30 },
      { feature: "ai_cv_extraction", enabled: true, monthlyLimit: 3 },
      { feature: "ai_skills_suggest", enabled: true, monthlyLimit: 10 },
      { feature: "ai_skills_gap", enabled: true, monthlyLimit: 5 },
      { feature: "ai_interview_questions", enabled: true, monthlyLimit: 10 },
      { feature: "ai_profile_fill", enabled: true, monthlyLimit: 3 },
      { feature: "ai_enhance_text", enabled: true, monthlyLimit: 10 },
      { feature: "ai_generate_summary", enabled: true, monthlyLimit: 5 },
      { feature: "ai_daily_insights", enabled: true, monthlyLimit: 0 },
      { feature: "ai_voice_input", enabled: false, monthlyLimit: 0 },
      { feature: "ai_job_matching", enabled: false, monthlyLimit: 0 },
      { feature: "ai_candidate_screening", enabled: false, monthlyLimit: 0 },
      { feature: "ai_salary_benchmark", enabled: false, monthlyLimit: 0 },
      { feature: "ai_job_description", enabled: false, monthlyLimit: 0 },
      { feature: "ai_hiring_reports", enabled: false, monthlyLimit: 0 },
    ],
    profileVisibilityBoost: true,
    salaryInsights: true,
    priorityApplicationReview: false,
    resumeBuilderAccess: true,
  };
}
