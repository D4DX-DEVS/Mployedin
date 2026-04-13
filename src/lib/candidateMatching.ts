import type { Candidate } from "@/hooks/useCandidates";

export type CandidateScoreFilter = "all" | "high" | "good" | "low" | "unscored";

export interface CandidateMatchSessionState {
  selectedJobId: string;
  reviewListIds: string[];
}

const HIGH_MATCH_THRESHOLD = 80;
const GOOD_MATCH_THRESHOLD = 60;
const FALLBACK_REVIEW_COUNT = 5;

const DEFAULT_CANDIDATE_MATCH_SESSION_STATE: CandidateMatchSessionState = {
  selectedJobId: "",
  reviewListIds: [],
};

const sanitizeSessionIdList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];

  return Array.from(
    new Set(
      input
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
};

export function parseCandidateMatchSessionState(raw: string | null): CandidateMatchSessionState {
  if (!raw) return { ...DEFAULT_CANDIDATE_MATCH_SESSION_STATE };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_CANDIDATE_MATCH_SESSION_STATE };
    }

    const state = parsed as {
      selectedJobId?: unknown;
      reviewListIds?: unknown;
    };

    return {
      selectedJobId: typeof state.selectedJobId === "string" ? state.selectedJobId.trim() : "",
      reviewListIds: sanitizeSessionIdList(state.reviewListIds),
    };
  } catch {
    return { ...DEFAULT_CANDIDATE_MATCH_SESSION_STATE };
  }
}

export function serializeCandidateMatchSessionState(state: CandidateMatchSessionState): string {
  return JSON.stringify({
    selectedJobId: state.selectedJobId.trim(),
    reviewListIds: sanitizeSessionIdList(state.reviewListIds),
  });
}

export function filterCandidatesByScore(
  candidates: Candidate[],
  scoreFilter: CandidateScoreFilter
): Candidate[] {
  return candidates.filter((candidate) => {
    const score = candidate.matchScore;

    if (scoreFilter === "high") return score != null && score >= HIGH_MATCH_THRESHOLD;
    if (scoreFilter === "good") return score != null && score >= GOOD_MATCH_THRESHOLD && score < HIGH_MATCH_THRESHOLD;
    if (scoreFilter === "low") return score != null && score < GOOD_MATCH_THRESHOLD;
    if (scoreFilter === "unscored") return score == null;

    return true;
  });
}

export function getScoreFilterCounts(candidates: Candidate[]): Record<CandidateScoreFilter, number> {
  return {
    all: candidates.length,
    high: candidates.filter((candidate) => (candidate.matchScore ?? -1) >= HIGH_MATCH_THRESHOLD).length,
    good: candidates.filter((candidate) => {
      const score = candidate.matchScore ?? -1;
      return score >= GOOD_MATCH_THRESHOLD && score < HIGH_MATCH_THRESHOLD;
    }).length,
    low: candidates.filter((candidate) => candidate.matchScore != null && candidate.matchScore < GOOD_MATCH_THRESHOLD).length,
    unscored: candidates.filter((candidate) => candidate.matchScore == null).length,
  };
}

export function getAutoReviewCandidateIds(candidates: Candidate[]): string[] {
  const scoredCandidates = candidates
    .filter((candidate) => candidate.matchScore != null)
    .sort((left, right) => (right.matchScore ?? 0) - (left.matchScore ?? 0));

  if (scoredCandidates.length === 0) return [];

  const highMatches = scoredCandidates.filter((candidate) => (candidate.matchScore ?? 0) >= HIGH_MATCH_THRESHOLD);
  const reviewTargets = highMatches.length > 0 ? highMatches : scoredCandidates.slice(0, FALLBACK_REVIEW_COUNT);

  return reviewTargets.map((candidate) => candidate._id);
}

interface CandidateWorkflowStateArgs {
  hasSelectedJob: boolean;
  selectedJobTitle?: string;
  hasScores: boolean;
  reviewCount: number;
}

export interface CandidateWorkflowState {
  stageLabel: string;
  title: string;
  description: string;
  note: string;
}

export function getCandidateWorkflowState({
  hasSelectedJob,
  selectedJobTitle,
  hasScores,
  reviewCount,
}: CandidateWorkflowStateArgs): CandidateWorkflowState {
  if (!hasSelectedJob) {
    return {
      stageLabel: "Step 1",
      title: "Choose a job before matching",
      description: "Pick one published role so the candidate list has a clear benchmark.",
      note: "This page compares the talent pool. It does not move anyone into the hiring pipeline.",
    };
  }

  if (!hasScores) {
    return {
      stageLabel: "Step 2",
      title: `Run AI match for ${selectedJobTitle ?? "the selected job"}`,
      description: "AI scoring compares the visible candidates on this page against the selected role.",
      note: "Scores help you review profiles faster, but they are only generated for the candidates currently loaded here.",
    };
  }

  if (reviewCount === 0) {
    return {
      stageLabel: "Step 3",
      title: "Save strong profiles to the review list",
      description: "Keep the best matches together so you can open profiles, CVs, or message candidates.",
      note: "The review list stays available in this browser tab until you clear it or close the tab.",
    };
  }

  return {
    stageLabel: "Next step",
    title: `${reviewCount} candidate${reviewCount === 1 ? "" : "s"} saved for review`,
    description: "Use the saved list to review CVs and profiles, or message candidates directly from this page.",
    note: "If someone has already applied, move them through Shortlisted or Interview from the Applications page for that job.",
  };
}