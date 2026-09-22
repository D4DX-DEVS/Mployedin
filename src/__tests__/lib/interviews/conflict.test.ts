/**
 * @jest-environment node
 *
 * The old guard asked only whether an existing interview's *start* fell inside
 * the new slot's window. A long interview already in progress therefore slipped
 * through: existing 09:00 for 120 min vs a new 10:30 booking is an overlap, but
 * 09:00 is outside [10:00, 11:00) so nothing was found.
 *
 * Overlap is about intervals, not start points.
 */
import {
  MAX_INTERVIEW_MINUTES,
  conflictWindow,
  findOverlap,
  type ExistingInterview,
} from "@/lib/interviews/conflict";

const at = (iso: string) => new Date(iso);

describe("findOverlap", () => {
  const newStart = at("2026-10-05T10:30:00Z");

  it("catches a long interview that started before the window", () => {
    const existing: ExistingInterview[] = [{ scheduledAt: at("2026-10-05T09:00:00Z"), duration: 120 }];
    expect(findOverlap(newStart, 30, 0, existing)).toBe(existing[0]);
  });

  it("ignores a long interview that ends before the new one starts", () => {
    const existing: ExistingInterview[] = [{ scheduledAt: at("2026-10-05T09:00:00Z"), duration: 60 }];
    expect(findOverlap(newStart, 30, 0, existing)).toBeNull();
  });

  it("catches an interview starting inside the new slot", () => {
    const existing: ExistingInterview[] = [{ scheduledAt: at("2026-10-05T10:45:00Z"), duration: 30 }];
    expect(findOverlap(newStart, 30, 0, existing)).toBe(existing[0]);
  });

  it("treats back-to-back as free when there is no buffer", () => {
    const existing: ExistingInterview[] = [{ scheduledAt: at("2026-10-05T10:00:00Z"), duration: 30 }];
    expect(findOverlap(newStart, 30, 0, existing)).toBeNull();
  });

  it("treats back-to-back as a conflict once a buffer is set", () => {
    const existing: ExistingInterview[] = [{ scheduledAt: at("2026-10-05T10:00:00Z"), duration: 30 }];
    expect(findOverlap(newStart, 30, 15, existing)).toBe(existing[0]);
  });

  it("applies the buffer on both sides", () => {
    const after: ExistingInterview[] = [{ scheduledAt: at("2026-10-05T11:00:00Z"), duration: 30 }];
    expect(findOverlap(newStart, 30, 0, after)).toBeNull();
    expect(findOverlap(newStart, 30, 15, after)).toBe(after[0]);
  });

  it("defaults a missing duration rather than treating it as zero", () => {
    const existing: ExistingInterview[] = [{ scheduledAt: at("2026-10-05T10:15:00Z") }];
    expect(findOverlap(newStart, 30, 0, existing)).toBe(existing[0]);
  });

  it("returns null for an empty list", () => {
    expect(findOverlap(newStart, 30, 30, [])).toBeNull();
  });

  it("skips rows with an unusable date instead of throwing", () => {
    const existing: ExistingInterview[] = [{ scheduledAt: "not a date", duration: 30 }];
    expect(findOverlap(newStart, 30, 0, existing)).toBeNull();
  });
});

describe("conflictWindow", () => {
  const newStart = at("2026-10-05T10:30:00Z");

  it("reaches back far enough to load any interview that could still be running", () => {
    const { from, to } = conflictWindow(newStart, 30, 15);
    // Buffer back off the start, then the longest interview we allow.
    expect(from.toISOString()).toBe("2026-10-05T02:15:00.000Z");
    expect(to.toISOString()).toBe("2026-10-05T11:15:00.000Z");
    expect(MAX_INTERVIEW_MINUTES).toBe(480);
  });

  it("widens with the new interview's own duration", () => {
    expect(conflictWindow(newStart, 60, 0).to.toISOString()).toBe("2026-10-05T11:30:00.000Z");
  });
});
