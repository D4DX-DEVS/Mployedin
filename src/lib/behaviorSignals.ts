/**
 * Compute behavioral engagement signals for a job application.
 * Returns individual signals + an aggregate score (0-100).
 *
 * Weight breakdown:
 *   Profile completeness   30%
 *   Application quality    30%
 *   Source quality          20%
 *   Cover letter effort     20%
 */

export interface BehaviorInput {
  profileCompleteness: number; // 0-100 from JobSeeker
  documents: { name: string; url: string; type: string }[];
  coverLetter?: string;
  source: "easy_apply" | "full_form" | "direct" | "auto_apply" | string;
  autoApplied: boolean;
  lastActiveAt?: Date | string;
  companyProfileViewed?: boolean;
  messageResponseTimeHrs?: number; // avg hours
}

export interface BehaviorResult {
  signals: {
    responseTime?: number;
    coverLetterCustomized?: boolean;
    profileCompleteness: number;
    applicationCompleteness: number;
    companyProfileViewed?: boolean;
    lastActiveAt?: Date;
  };
  score: number; // 0-100
}

const COVER_LETTER_MIN_CUSTOM_LENGTH = 150;
const COVER_LETTER_GENERIC_PHRASES = [
  "to whom it may concern",
  "i am writing to apply",
  "i am interested in",
  "please find attached",
  "dear hiring manager",
];

export function computeBehaviorSignals(input: BehaviorInput): BehaviorResult {
  const {
    profileCompleteness,
    documents,
    coverLetter,
    source,
    autoApplied,
    lastActiveAt,
    companyProfileViewed,
    messageResponseTimeHrs,
  } = input;

  // ── Profile completeness (30%) ──
  const profileScore = Math.min(100, Math.max(0, profileCompleteness));

  // ── Application completeness (30%) ──
  let appScore = 0;
  const hasResume = documents.some(
    (d) => d.type === "resume" || d.type === "cv" || d.name?.toLowerCase().includes("resume"),
  );
  if (hasResume) appScore += 40;
  if (coverLetter && coverLetter.trim().length > 0) appScore += 30;
  if (documents.length >= 2) appScore += 15; // extra docs
  if (!autoApplied) appScore += 15; // manual effort
  appScore = Math.min(100, appScore);

  // ── Cover letter customization (20%) ──
  let coverLetterCustomized = false;
  let coverLetterScore = 0;
  if (coverLetter && coverLetter.trim().length >= COVER_LETTER_MIN_CUSTOM_LENGTH) {
    const lower = coverLetter.toLowerCase();
    const genericCount = COVER_LETTER_GENERIC_PHRASES.filter((p) => lower.includes(p)).length;
    coverLetterCustomized = genericCount <= 1;
    coverLetterScore = coverLetterCustomized ? 100 : 40;
  } else if (coverLetter && coverLetter.trim().length > 0) {
    coverLetterScore = 30; // short but present
  }

  // ── Source quality (20%) ──
  const sourceScores: Record<string, number> = {
    full_form: 100,
    direct: 90,
    easy_apply: 60,
    auto_apply: 30,
  };
  const sourceScore = sourceScores[source] ?? 50;

  // ── Aggregate score ──
  const score = Math.round(
    profileScore * 0.3 + appScore * 0.3 + coverLetterScore * 0.2 + sourceScore * 0.2,
  );

  return {
    signals: {
      responseTime: messageResponseTimeHrs,
      coverLetterCustomized,
      profileCompleteness,
      applicationCompleteness: appScore,
      companyProfileViewed: companyProfileViewed ?? false,
      lastActiveAt: lastActiveAt ? new Date(lastActiveAt) : undefined,
    },
    score: Math.min(100, Math.max(0, score)),
  };
}

/**
 * Derive display badges from behavioral signals.
 */
export function deriveBehaviorBadges(
  signals: BehaviorResult["signals"],
  score: number,
): string[] {
  const badges: string[] = [];

  if (signals.responseTime != null && signals.responseTime <= 4) {
    badges.push("Fast responder ⚡");
  }
  if (signals.coverLetterCustomized) {
    badges.push("Detailed application 📝");
  }
  if (signals.profileCompleteness >= 90) {
    badges.push("Complete profile ✅");
  }
  if (signals.companyProfileViewed) {
    badges.push("Researched company 🔍");
  }
  if (score >= 80) {
    badges.push("Highly engaged 🌟");
  }

  return badges;
}
