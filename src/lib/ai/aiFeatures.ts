/** Features shown on the admin AI usage page. No server imports: client components read this. */
export type AiFeature =
  | "job_assistant"
  | "cv_reading"
  | "job_matching"
  | "poster"
  | "copilot"
  | "market_report"
  | "lead_tools"
  | "interview"
  | "search"
  | "embeddings"
  | "other";

export const AI_FEATURES: readonly AiFeature[] = [
  "job_assistant",
  "cv_reading",
  "job_matching",
  "poster",
  "copilot",
  "market_report",
  "lead_tools",
  "interview",
  "search",
  "embeddings",
  "other",
];
