/**
 * @jest-environment node
 *
 * A calendar client ignores an updated invitation whose SEQUENCE has not
 * moved, so the reader keeps the stale time. `rescheduleCount` is not a
 * substitute: changing the meeting link or the venue is material too, and
 * neither is a reschedule.
 *
 * Equally, bumping on every save would re-prompt the candidate for changes
 * they cannot see — a typo in the instructions must not reissue the invite.
 */
import { isMaterialChange, MATERIAL_FIELDS } from "@/lib/interviews/materialChange";

describe("isMaterialChange", () => {
  it("counts a new time", () => {
    expect(isMaterialChange({ scheduledAt: "2026-10-06T06:00:00Z" })).toBe(true);
  });

  it("counts a new length, type, venue or link", () => {
    expect(isMaterialChange({ duration: 60 })).toBe(true);
    expect(isMaterialChange({ type: "offline" })).toBe(true);
    expect(isMaterialChange({ location: "Level 4" })).toBe(true);
    expect(isMaterialChange({ meetLink: "https://meet.test/new" })).toBe(true);
  });

  it("counts a cancellation", () => {
    expect(isMaterialChange({ status: "cancelled" })).toBe(true);
  });

  it("ignores changes the candidate's calendar cannot show", () => {
    expect(isMaterialChange({ instructions: "Bring your portfolio" })).toBe(false);
    expect(isMaterialChange({ feedback: "Strong" })).toBe(false);
    expect(isMaterialChange({ outcome: "passed" })).toBe(false);
    expect(isMaterialChange({})).toBe(false);
  });

  it("ignores a field explicitly set to undefined", () => {
    expect(isMaterialChange({ scheduledAt: undefined })).toBe(false);
  });

  it("does not treat completion as something to reissue", () => {
    // The meeting happened; resending a calendar invitation would be absurd.
    expect(isMaterialChange({ status: "completed" })).toBe(false);
  });

  it("lists the fields it watches, so the set is reviewable", () => {
    expect([...MATERIAL_FIELDS].sort()).toEqual(
      ["duration", "location", "meetLink", "scheduledAt", "type"].sort(),
    );
  });
});
