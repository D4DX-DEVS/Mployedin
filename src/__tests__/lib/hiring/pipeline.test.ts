import {
  PIPELINE_STAGES,
  DEFAULT_WORKFLOW_STAGES,
  normalizeStageId,
  normalizeWorkflowStages,
  hasLegacyStageIds,
} from "@/lib/hiring/pipeline";

const legacyDefaults = [
  { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
  { id: "screening", label: "AI Screening", enabled: true, autoProgress: true, order: 2 },
  { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
  { id: "interview_scheduled", label: "Interview Scheduled", enabled: true, autoProgress: true, order: 4 },
  { id: "interview_completed", label: "Interview Completed", enabled: true, autoProgress: false, order: 5 },
  { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 6 },
  { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 7 },
  { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 8 },
];

describe("hiring pipeline", () => {
  it("maps the legacy editor ids onto application statuses", () => {
    expect(normalizeStageId("new")).toBe("applied");
    expect(normalizeStageId("screening")).toBe("shortlisted");
    expect(normalizeStageId("interview_completed")).toBe("selected");
    expect(normalizeStageId("offer_extended")).toBe("offer");
    expect(normalizeStageId("accepted")).toBe("hired");
    expect(normalizeStageId("applied")).toBe("applied");
    expect(normalizeStageId("phone_screen")).toBeNull();
  });

  it("normalises the pre-2026-09 default pipeline: canonical ids, no duplicates, no automation", () => {
    const out = normalizeWorkflowStages(legacyDefaults);
    expect(out.map((s) => s.id)).toEqual([
      "applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected",
    ]);
    expect(out.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out.every((s) => s.autoProgress === false)).toBe(true);
    expect(out[0].label).toBe("New Application");
  });

  it("keeps auto-progress flags when nothing needed remapping", () => {
    const out = normalizeWorkflowStages([
      { id: "applied", label: "Applied", enabled: true, autoProgress: true, order: 1 },
      { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 2 },
    ]);
    expect(out[0].autoProgress).toBe(true);
  });

  it("drops unknown ids, merges duplicates and renumbers by stored order", () => {
    const out = normalizeWorkflowStages([
      { id: "offer", label: "Offer", enabled: true, autoProgress: false, order: 5 },
      { id: "phone_screen", label: "Phone screen", enabled: true, autoProgress: false, order: 2 },
      { id: "applied", label: "Applied", enabled: true, autoProgress: false, order: 1 },
      { id: "offer_extended", label: "Offer again", enabled: false, autoProgress: false, order: 6 },
    ]);
    expect(out.map((s) => [s.id, s.order])).toEqual([["applied", 1], ["offer", 2]]);
    expect(out[1].enabled).toBe(true);
  });

  it("default pipeline is the canonical order plus rejected", () => {
    expect(DEFAULT_WORKFLOW_STAGES.map((s) => s.id)).toEqual([...PIPELINE_STAGES, "rejected"]);
    expect(DEFAULT_WORKFLOW_STAGES.every((s) => s.autoProgress === false)).toBe(true);
  });

  it("detects lists that still need migration", () => {
    expect(hasLegacyStageIds(legacyDefaults)).toBe(true);
    expect(hasLegacyStageIds(DEFAULT_WORKFLOW_STAGES)).toBe(false);
  });
});
