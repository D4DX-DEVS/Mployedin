import type { AIFeatureKey } from "@/types/subscription-plan";

// ── Feature label key mapping (labels resolved at render) ──
export const AI_FEATURE_LABEL_KEYS: Record<AIFeatureKey, string> = {
  ai_chat: "aiChatLabel",
  ai_daily_insights: "aiDailyInsightsLabel",
  ai_job_matching: "aiJobMatchingLabel",
  ai_cv_extraction: "aiCvExtractionLabel",
  ai_interview_questions: "aiInterviewQuestionsLabel",
  ai_skills_gap: "aiSkillsGapLabel",
  ai_candidate_screening: "aiCandidateScreeningLabel",
  ai_salary_benchmark: "aiSalaryBenchmarkLabel",
  ai_job_description: "aiJobDescriptionLabel",
  ai_hiring_reports: "aiHiringReportsLabel",
  ai_voice_input: "aiVoiceInputLabel",
  ai_skills_suggest: "aiSkillsSuggestLabel",
  ai_profile_fill: "aiProfileFillLabel",
  ai_enhance_text: "aiEnhanceTextLabel",
  ai_generate_summary: "aiGenerateSummaryLabel",
};

export const TIER_COLORS: Record<number, string> = {
  0: "bg-zinc-100 text-zinc-700",
  1: "bg-slate-200 text-foreground",
  2: "bg-amber-100 text-amber-700",
  3: "bg-violet-100 text-violet-700",
};

export const BILLING_CYCLE_LABEL_KEYS = {
  monthly: "billingCycleMonthly",
  quarterly: "billingCycleQuarterly",
  yearly: "billingCycleYearly",
} as const;
