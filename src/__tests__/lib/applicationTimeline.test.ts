/**
 * The application page's progress trail (client report 2026-10-06: "the
 * detailed view is not proper"). LinkedIn, Indeed and Naukri all show a dated
 * trail including the moment the employer viewed the application; ours showed
 * undated status pills.
 */
import { buildApplicationTimeline, nextStepFor } from "@/lib/jobSeeker/applicationTimeline";

describe("buildApplicationTimeline", () => {
  it("orders status changes and the employer's view by time, and marks where it stands", () => {
    const events = buildApplicationTimeline({
      status: "shortlisted",
      appliedAt: "2026-09-01T08:00:00Z",
      viewedByEmployerAt: "2026-09-02T10:00:00Z",
      statusHistory: [
        { status: "applied", changedAt: "2026-09-01T08:00:00Z" },
        { status: "shortlisted", changedAt: "2026-09-03T09:00:00Z" },
      ],
    });
    expect(events.map((e) => [e.kind, e.status ?? null, e.current])).toEqual([
      ["status", "applied", false],
      ["viewed", null, false],
      ["status", "shortlisted", true],
    ]);
  });

  it("starts from the applied date when no history was recorded", () => {
    const events = buildApplicationTimeline({ status: "applied", appliedAt: "2026-09-01T08:00:00Z", statusHistory: [] });
    expect(events).toEqual([{ kind: "status", status: "applied", at: "2026-09-01T08:00:00Z", current: true }]);
  });

  it("drops back-to-back repeats (a rescheduled interview logs its status twice)", () => {
    const events = buildApplicationTimeline({
      status: "interview_scheduled",
      appliedAt: "2026-07-20T06:00:00Z",
      statusHistory: [
        { status: "applied", changedAt: "2026-07-20T06:00:00Z" },
        { status: "interview_scheduled", changedAt: "2026-07-20T06:15:00Z" },
        { status: "interview_scheduled", changedAt: "2026-07-20T06:40:00Z" },
      ],
    });
    expect(events.filter((e) => e.kind === "status")).toHaveLength(2);
  });

  it("ignores a view stamped before the application (bad data)", () => {
    const events = buildApplicationTimeline({
      status: "applied",
      appliedAt: "2026-09-05T08:00:00Z",
      viewedByEmployerAt: "2026-09-01T08:00:00Z",
      statusHistory: [{ status: "applied", changedAt: "2026-09-05T08:00:00Z" }],
    });
    expect(events.some((e) => e.kind === "viewed")).toBe(false);
  });
});

describe("nextStepFor", () => {
  it("tells an applied seeker whether the employer has looked yet", () => {
    expect(nextStepFor("applied", false)).toBe("applied");
    expect(nextStepFor("applied", true)).toBe("applied_viewed");
  });

  it("has guidance for every pipeline and closing status, and none for unknown ones", () => {
    for (const s of ["shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"]) {
      expect(nextStepFor(s, false)).toBe(s);
    }
    expect(nextStepFor("custom_stage", false)).toBeNull();
  });
});
