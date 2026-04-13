import {
  filterCandidatesByScore,
  getAutoReviewCandidateIds,
  getCandidateWorkflowState,
  getScoreFilterCounts,
  parseCandidateMatchSessionState,
  serializeCandidateMatchSessionState,
} from "@/lib/candidateMatching";
import type { Candidate } from "@/hooks/useCandidates";

const candidates: Candidate[] = [
  { _id: "c1", matchScore: 92 },
  { _id: "c2", matchScore: 81 },
  { _id: "c3", matchScore: 68 },
  { _id: "c4", matchScore: 51 },
  { _id: "c5" },
];

describe("candidateMatching helpers", () => {
  test("filters candidates by score buckets", () => {
    expect(filterCandidatesByScore(candidates, "high").map((candidate) => candidate._id)).toEqual(["c1", "c2"]);
    expect(filterCandidatesByScore(candidates, "good").map((candidate) => candidate._id)).toEqual(["c3"]);
    expect(filterCandidatesByScore(candidates, "low").map((candidate) => candidate._id)).toEqual(["c4"]);
    expect(filterCandidatesByScore(candidates, "unscored").map((candidate) => candidate._id)).toEqual(["c5"]);
  });

  test("counts candidates for each score filter", () => {
    expect(getScoreFilterCounts(candidates)).toEqual({
      all: 5,
      high: 2,
      good: 1,
      low: 1,
      unscored: 1,
    });
  });

  test("prefers all high matches for automatic review selection", () => {
    expect(getAutoReviewCandidateIds(candidates)).toEqual(["c1", "c2"]);
  });

  test("falls back to top five scored candidates when no high matches exist", () => {
    const lowerScoredCandidates: Candidate[] = [
      { _id: "c1", matchScore: 75 },
      { _id: "c2", matchScore: 71 },
      { _id: "c3", matchScore: 67 },
      { _id: "c4", matchScore: 63 },
      { _id: "c5", matchScore: 58 },
      { _id: "c6", matchScore: 41 },
    ];

    expect(getAutoReviewCandidateIds(lowerScoredCandidates)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  test("describes the real next step once candidates are saved for review", () => {
    expect(getCandidateWorkflowState({
      hasSelectedJob: true,
      selectedJobTitle: "Senior Full Stack Developer",
      hasScores: true,
      reviewCount: 2,
    })).toEqual({
      stageLabel: "Next step",
      title: "2 candidates saved for review",
      description: "Use the saved list to review CVs and profiles, or message candidates directly from this page.",
      note: "If someone has already applied, move them through Shortlisted or Interview from the Applications page for that job.",
    });
  });

  test("returns an empty session state for invalid persisted data", () => {
    expect(parseCandidateMatchSessionState("{bad json")).toEqual({
      selectedJobId: "",
      reviewListIds: [],
    });
  });

  test("sanitizes and deduplicates persisted review ids", () => {
    expect(parseCandidateMatchSessionState(JSON.stringify({
      selectedJobId: "  job-123  ",
      reviewListIds: ["cand-1", "cand-2", "cand-1", 42, "  cand-3  ", ""],
    }))).toEqual({
      selectedJobId: "job-123",
      reviewListIds: ["cand-1", "cand-2", "cand-3"],
    });
  });

  test("round-trips persisted candidate matching session state", () => {
    const state = {
      selectedJobId: "job-99",
      reviewListIds: ["cand-a", "cand-b"],
    };

    expect(parseCandidateMatchSessionState(serializeCandidateMatchSessionState(state))).toEqual(state);
  });
});