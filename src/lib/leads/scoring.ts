import type { LeadQualification, LeadStatus } from "@/models/Lead";

interface ScoreInput {
  status: LeadStatus;
  hasEmail: boolean;
  hasPhone: boolean;
  hasExpectedRevenue: boolean;
  hasIndustry: boolean;
  activityCount: number;
}

const STATUS_SCORES: Record<LeadStatus, number> = {
  new: 10,
  contacted: 25,
  interested: 50,
  negotiating: 75,
  converted: 100,
  lost: 0,
};

export function calculateLeadScore(input: ScoreInput): number {
  let score = STATUS_SCORES[input.status] ?? 0;

  if (input.hasEmail) score += 5;
  if (input.hasPhone) score += 5;
  if (input.hasExpectedRevenue) score += 10;
  if (input.hasIndustry) score += 5;

  const activityBonus = Math.min(input.activityCount * 2, 10);
  score += activityBonus;

  return Math.min(score, 100);
}

export function deriveQualification(score: number): LeadQualification {
  if (score >= 75) return "qualified";
  if (score >= 50) return "hot";
  if (score >= 25) return "warm";
  return "cold";
}
