import {
  BULK_MOVE_TARGETS,
  STAFF_TRANSITIONS,
  canTransitionApplication,
  invalidTransitionBody,
  isRecordBackedStatus,
} from "@/lib/hiring/applicationTransitions";
import { ALL_APPLICATION_STATUSES } from "@/lib/hiring/pipeline";
import type { ApplicationStatus } from "@/models/Application";

describe("application status transitions (AP-3)", () => {
  it("defines a row for every application status", () => {
    expect(Object.keys(STAFF_TRANSITIONS).sort()).toEqual([...ALL_APPLICATION_STATUSES].sort());
  });

  it("always allows a no-op move", () => {
    for (const s of ALL_APPLICATION_STATUSES) {
      expect(canTransitionApplication(s, s, "staff")).toBe(true);
      expect(canTransitionApplication(s, s, "job_seeker")).toBe(true);
    }
  });

  describe("job seeker", () => {
    it.each(["applied", "shortlisted", "interview_scheduled", "selected", "offer"] as ApplicationStatus[])(
      "may withdraw from %s",
      (from) => {
        expect(canTransitionApplication(from, "withdrawn", "job_seeker")).toBe(true);
      },
    );

    it.each(["hired", "rejected"] as ApplicationStatus[])("may not withdraw a %s application", (from) => {
      expect(canTransitionApplication(from, "withdrawn", "job_seeker")).toBe(false);
    });

    it("may not set any other status", () => {
      for (const to of ALL_APPLICATION_STATUSES.filter((s) => s !== "withdrawn" && s !== "applied")) {
        expect(canTransitionApplication("applied", to, "job_seeker")).toBe(false);
      }
    });
  });

  describe("staff", () => {
    it("treats hired and withdrawn as final", () => {
      for (const to of ALL_APPLICATION_STATUSES) {
        if (to !== "hired") expect(canTransitionApplication("hired", to, "staff")).toBe(false);
        if (to !== "withdrawn") expect(canTransitionApplication("withdrawn", to, "staff")).toBe(false);
      }
    });

    it("hires only from selected or offer", () => {
      const from = ALL_APPLICATION_STATUSES.filter((s) => canTransitionApplication(s, "hired", "staff") && s !== "hired");
      expect(from.sort()).toEqual(["offer", "selected"]);
    });

    it("reaches offer only from selected", () => {
      expect(canTransitionApplication("selected", "offer", "staff")).toBe(true);
      expect(canTransitionApplication("applied", "offer", "staff")).toBe(false);
      expect(canTransitionApplication("shortlisted", "offer", "staff")).toBe(false);
    });

    it("may reopen a rejection into the open funnel but not straight to offer or hired", () => {
      expect(canTransitionApplication("rejected", "shortlisted", "staff")).toBe(true);
      expect(canTransitionApplication("rejected", "offer", "staff")).toBe(false);
      expect(canTransitionApplication("rejected", "hired", "staff")).toBe(false);
    });

    it("allows backwards moves between open funnel stages", () => {
      expect(canTransitionApplication("selected", "shortlisted", "staff")).toBe(true);
      expect(canTransitionApplication("offer", "selected", "staff")).toBe(true);
    });
  });

  it("marks offer and interview_scheduled as record-backed", () => {
    expect(isRecordBackedStatus("offer")).toBe(true);
    expect(isRecordBackedStatus("interview_scheduled")).toBe(true);
    expect(isRecordBackedStatus("selected")).toBe(false);
  });

  it("limits bulk moves to stages that need no backing record (AP-12)", () => {
    expect([...BULK_MOVE_TARGETS].sort()).toEqual(["rejected", "selected", "shortlisted"]);
  });

  it("builds the 409 body with the invalid_transition code", () => {
    expect(invalidTransitionBody("hired", "withdrawn")).toEqual(
      expect.objectContaining({ code: "invalid_transition", from: "hired", to: "withdrawn" }),
    );
  });
});
