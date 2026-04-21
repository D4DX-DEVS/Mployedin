// ── Shared subscription plan types & constants ──────────────────────────────
// This file is safe to import from client components (no mongoose dependency).

// ── Plan Target ──────────────────────────────────────────────────────────────
export type PlanTargetRole = "employer" | "job_seeker";

// ── AI Feature Keys ──────────────────────────────────────────────────────────
export type AIFeatureKey =
  | "ai_chat"
  | "ai_daily_insights"
  | "ai_job_matching"
  | "ai_cv_extraction"
  | "ai_interview_questions"
  | "ai_skills_gap"
  | "ai_candidate_screening"
  | "ai_salary_benchmark"
  | "ai_job_description"
  | "ai_hiring_reports"
  | "ai_voice_input"
  | "ai_skills_suggest"
  | "ai_profile_fill"
  | "ai_enhance_text"
  | "ai_generate_summary";

export const AI_FEATURE_KEYS: AIFeatureKey[] = [
  "ai_chat", "ai_daily_insights", "ai_job_matching", "ai_cv_extraction",
  "ai_interview_questions", "ai_skills_gap", "ai_candidate_screening",
  "ai_salary_benchmark", "ai_job_description", "ai_hiring_reports",
  "ai_voice_input", "ai_skills_suggest", "ai_profile_fill",
  "ai_enhance_text", "ai_generate_summary",
];

// ── AI Feature Limit ─────────────────────────────────────────────────────────
export interface IAIFeatureLimit {
  feature: AIFeatureKey;
  enabled: boolean;
  monthlyLimit: number; // 0 = unlimited when enabled
}

// ── Employer Feature Limits ──────────────────────────────────────────────────
export interface IEmployerFeatureLimits {
  maxActiveJobs: number;                // -1 = unlimited
  maxApplicationsViewPerMonth: number;  // -1 = unlimited
  maxTeamMembers: number;               // -1 = unlimited
  aiFeatures: IAIFeatureLimit[];
  analyticsLevel: "none" | "basic" | "advanced";
  dataExport: boolean;
  commTemplates: boolean;
  scorecardEvaluations: boolean;
  matchingWeightCustomization: boolean;
  workflowCustomization: boolean;
  prioritySupport: boolean;
  featuredJobListings: number;          // 0 = none, -1 = unlimited
  brandedCompanyPage: boolean;
}

// ── Job Seeker Feature Limits ────────────────────────────────────────────────
export interface IJobSeekerFeatureLimits {
  maxApplicationsPerMonth: number;      // -1 = unlimited
  aiFeatures: IAIFeatureLimit[];
  profileVisibilityBoost: boolean;
  salaryInsights: boolean;
  priorityApplicationReview: boolean;
  resumeBuilderAccess: boolean;
}
