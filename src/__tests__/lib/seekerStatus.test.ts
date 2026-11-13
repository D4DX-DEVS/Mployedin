import {
  SEEKER_STATUS_TABS,
  SEEKER_TAB_STATUSES,
  isSilentForSeeker,
  seekerStageHistory,
  seekerStageOf,
  seekerTabCounts,
} from "@/lib/jobSeeker/seekerStatus";
import { ALL_APPLICATION_STATUSES } from "@/lib/hiring/pipeline";

describe("seekerStageOf", () => {
  it("folds the employer's eight stages into the seeker's five steps and two endings", () => {
    expect(ALL_APPLICATION_STATUSES.map((s) => [s, seekerStageOf(s)])).toEqual([
      ["applied", "applied"],
      ["shortlisted", "in_review"],
      ["interview_scheduled", "interview"],
      ["selected", "interview"],
      ["offer", "offer"],
      ["hired", "hired"],
      ["rejected", "not_selected"],
      ["withdrawn", "withdrawn"],
    ]);
  });

  it("knows nothing of an unknown or empty status", () => {
    expect(seekerStageOf("custom_stage")).toBeNull();
    expect(seekerStageOf("")).toBeNull();
    expect(seekerStageOf(undefined)).toBeNull();
  });
});

describe("seeker tabs", () => {
  it("are All, Interview, Offer and Closed", () => {
    expect(SEEKER_STATUS_TABS).toEqual(["all", "interview", "offer", "closed"]);
  });

  it("put every stage after In review under exactly one tab", () => {
    const grouped = Object.values(SEEKER_TAB_STATUSES).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(
      ["interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"].sort(),
    );
  });

  it("sum their counts from per-stage counts (the Offer tab includes the hired)", () => {
    expect(seekerTabCounts({ applied: 13, selected: 7, offer: 4, hired: 4, rejected: 7, withdrawn: 9 })).toEqual({
      interview: 7,
      offer: 8,
      closed: 16,
    });
  });
});

describe("isSilentForSeeker", () => {
  it("keeps Shortlisted and Selected from the seeker, and nothing else", () => {
    expect(ALL_APPLICATION_STATUSES.filter(isSilentForSeeker)).toEqual(["shortlisted", "selected"]);
  });
});

describe("seekerStageHistory", () => {
  it("drops a step the seeker already saw and keeps when it began", () => {
    const history = [
      { status: "applied", changedAt: "1" },
      { status: "interview_scheduled", changedAt: "2" },
      { status: "selected", changedAt: "3" },
      { status: "custom_stage", changedAt: "4" },
      { status: "offer", changedAt: "5" },
    ];
    expect(seekerStageHistory(history).map((h) => [h.stage, h.changedAt])).toEqual([
      ["applied", "1"],
      ["interview", "2"],
      ["offer", "5"],
    ]);
  });
});
