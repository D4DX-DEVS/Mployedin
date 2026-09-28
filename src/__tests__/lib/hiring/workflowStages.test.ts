import {
  DEFAULT_WORKFLOW_STAGE_DEFS,
  columnCounts,
  isStockStage,
  nextWorkflowStage,
  normalizeWorkflowStageDefs,
  stageForApplication,
  stageQueryFilter,
  validateWorkflowStageDefs,
  workflowColumns,
  type WorkflowStageDef,
} from "@/lib/hiring/workflowStages";

const stage = (id: string, label: string, phase: WorkflowStageDef["phase"], order: number): WorkflowStageDef => ({ id, label, phase, order });

// Tech Engineering Pipeline as seeded on staging before phases existed.
const LEGACY_TECH = [
  { id: "new", label: "New Application", enabled: true, autoProgress: false, order: 1 },
  { id: "screening", label: "AI Screening", enabled: true, autoProgress: false, order: 2 },
  { id: "shortlisted", label: "Shortlisted", enabled: true, autoProgress: false, order: 3 },
  { id: "coding_test", label: "Coding Test", enabled: true, autoProgress: false, order: 4 },
  { id: "technical_interview", label: "Technical Interview", enabled: true, autoProgress: false, order: 5 },
  { id: "culture_fit", label: "Culture Fit Interview", enabled: true, autoProgress: false, order: 6 },
  { id: "offer_extended", label: "Offer Extended", enabled: true, autoProgress: false, order: 7 },
  { id: "accepted", label: "Offer Accepted", enabled: true, autoProgress: false, order: 8 },
  { id: "rejected", label: "Rejected", enabled: true, autoProgress: false, order: 9 },
];

describe("normalizeWorkflowStageDefs", () => {
  it("falls back to the standard pipeline for anything that is not a list", () => {
    expect(normalizeWorkflowStageDefs(undefined)).toEqual(DEFAULT_WORKFLOW_STAGE_DEFS);
    expect(normalizeWorkflowStageDefs("nope")).toEqual(DEFAULT_WORKFLOW_STAGE_DEFS);
  });

  it("files legacy free-text stages under the status each one runs as", () => {
    const out = normalizeWorkflowStageDefs(LEGACY_TECH);
    expect(out.map((s) => [s.id, s.phase])).toEqual([
      ["new", "applied"],
      ["screening", "shortlisted"],
      ["shortlisted", "shortlisted"],
      ["coding_test", "shortlisted"],
      ["technical_interview", "interview_scheduled"],
      ["culture_fit", "interview_scheduled"],
      ["offer_extended", "offer"],
      ["accepted", "hired"],
    ]);
    expect(out.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out[3].label).toBe("Coding Test");
  });

  it("puts post-interview checks under Selected and keeps phases moving forward", () => {
    const out = normalizeWorkflowStageDefs([
      { id: "new", label: "New Application", enabled: true, order: 1 },
      { id: "panel_interview_1", label: "Panel Interview Round 1", enabled: true, order: 2 },
      { id: "board_review", label: "Board Review", enabled: true, order: 3 },
      { id: "reference_check", label: "Reference Check", enabled: true, order: 4 },
      { id: "screening", label: "Late screen", enabled: true, order: 5 },
      { id: "offer_extended", label: "Offer", enabled: true, order: 6 },
      { id: "accepted", label: "Accepted", enabled: true, order: 7 },
    ]);
    expect(out.map((s) => s.phase)).toEqual([
      "applied",
      "interview_scheduled",
      "selected",
      "selected",
      "selected", // a screen filed after the interview stays in the later status
      "offer",
      "hired",
    ]);
  });

  it("drops disabled stages and outcome stages", () => {
    const out = normalizeWorkflowStageDefs([
      { id: "applied", label: "Applied", enabled: true, order: 1 },
      { id: "offer", label: "Offer", enabled: false, order: 2 },
      { id: "rejected", label: "Rejected", enabled: true, order: 3 },
      { id: "hired", label: "Hired", enabled: true, order: 4 },
    ]);
    expect(out.map((s) => s.id)).toEqual(["applied", "hired"]);
  });

  it("adds a missing Applied or Hired stage and de-duplicates ids", () => {
    const out = normalizeWorkflowStageDefs([
      { id: "interview", label: "Talk", phase: "interview_scheduled", order: 1 },
      { id: "interview", label: "Talk again", phase: "interview_scheduled", order: 2 },
    ]);
    expect(out[0]).toMatchObject({ id: "applied", phase: "applied" });
    expect(out.at(-1)).toMatchObject({ id: "hired", phase: "hired" });
    expect(out.map((s) => s.id)).toEqual(["applied", "interview", "interview_2", "hired"]);
  });

  it("keeps explicit phases", () => {
    const out = normalizeWorkflowStageDefs([
      { id: "applied", label: "Applied", phase: "applied", order: 1 },
      { id: "exec_review", label: "Executive Review", phase: "selected", order: 2 },
      { id: "hired", label: "Hired", phase: "hired", order: 3 },
    ]);
    expect(out.map((s) => s.phase)).toEqual(["applied", "selected", "hired"]);
  });
});

describe("validateWorkflowStageDefs", () => {
  it("accepts the standard pipeline", () => {
    expect(validateWorkflowStageDefs(DEFAULT_WORKFLOW_STAGE_DEFS)).toEqual([]);
  });

  it("reports each structural problem", () => {
    expect(validateWorkflowStageDefs([stage("x", "X", "shortlisted", 1)])).toEqual(
      expect.arrayContaining(["too_few", "first_not_applied", "no_hired"]),
    );
    expect(
      validateWorkflowStageDefs([
        stage("applied", "Applied", "applied", 1),
        stage("offer", "Offer", "offer", 2),
        stage("talk", "Talk", "interview_scheduled", 3),
        stage("talk", " ", "hired", 4),
        stage("Bad Id", "Hired", "hired", 5),
      ]),
    ).toEqual(expect.arrayContaining(["phase_backwards", "duplicate_id", "empty_label", "bad_id"]));
  });
});

describe("stage placement", () => {
  const tech = normalizeWorkflowStageDefs(LEGACY_TECH);

  it("places an application in its recorded stage, else the first stage of its status", () => {
    expect(stageForApplication(tech, "shortlisted", "coding_test")?.id).toBe("coding_test");
    expect(stageForApplication(tech, "shortlisted", undefined)?.id).toBe("screening");
    // A stage from another status does not count.
    expect(stageForApplication(tech, "shortlisted", "culture_fit")?.id).toBe("screening");
    expect(stageForApplication(tech, "selected", null)).toBeNull();
  });

  it("builds one column per stage and shows a skipped status only while it holds candidates", () => {
    expect(workflowColumns(tech).map((c) => c.key)).toEqual([
      "stage:new",
      "stage:screening",
      "stage:shortlisted",
      "stage:coding_test",
      "stage:technical_interview",
      "stage:culture_fit",
      "stage:offer_extended",
      "stage:accepted",
    ]);
    const withSelected = workflowColumns(tech, { selected: 2 });
    expect(withSelected.map((c) => c.key)).toContain("phase:selected");
    expect(withSelected.findIndex((c) => c.key === "phase:selected")).toBe(6);
    // Single-stage statuses need no stage filter; shared ones do.
    expect(withSelected.find((c) => c.key === "stage:new")?.stageId).toBeNull();
    expect(withSelected.find((c) => c.key === "stage:coding_test")?.stageId).toBe("coding_test");
  });

  it("narrows a shared status to one stage, the first one absorbing unknown stages", () => {
    expect(stageQueryFilter(tech, "shortlisted", "screening")).toEqual({
      stageId: { $nin: ["shortlisted", "coding_test"] },
    });
    expect(stageQueryFilter(tech, "shortlisted", "coding_test")).toEqual({ stageId: "coding_test" });
    expect(stageQueryFilter(tech, "applied", "new")).toEqual({});
    expect(stageQueryFilter(tech, "shortlisted", "nope")).toBeNull();
    expect(stageQueryFilter(tech, "applied", "coding_test")).toBeNull();
  });

  it("sums status/stage rows into column totals", () => {
    const counts = columnCounts(tech, [
      { status: "shortlisted", stageId: null, count: 3 },
      { status: "shortlisted", stageId: "coding_test", count: 2 },
      { status: "shortlisted", stageId: "culture_fit", count: 1 },
      { status: "selected", stageId: null, count: 4 },
    ]);
    expect(counts).toEqual({ "stage:screening": 4, "stage:coding_test": 2, "phase:selected": 4 });
  });

  it("steps to the next stage in workflow order", () => {
    const current = tech.find((s) => s.id === "coding_test") ?? null;
    expect(nextWorkflowStage(tech, current)?.id).toBe("technical_interview");
    expect(nextWorkflowStage(tech, tech.at(-1) ?? null)).toBeNull();
  });

  it("knows a stock stage from a renamed one", () => {
    expect(isStockStage(DEFAULT_WORKFLOW_STAGE_DEFS[1])).toBe(true);
    expect(isStockStage({ id: "shortlisted", label: "Phone screen", phase: "shortlisted" })).toBe(false);
  });
});
