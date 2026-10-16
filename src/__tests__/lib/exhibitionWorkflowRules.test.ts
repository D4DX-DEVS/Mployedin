/**
 * Owner, 2026-10-15: the workflow is agent submits, super agent verifies,
 * admin approves the payment (with the support), agent reports the event. One
 * Send back replaces the step-back and reopen moves; amounts and details are
 * corrected in place, with a reason once the payment is approved. Priority
 * criteria are from client feedback 2026-10-14. These pin the rules the API
 * and the screens share.
 */
import { VALID_TRANSITIONS, canMove, editNeedsReason, eventHasStarted, isSettled } from "@/lib/exhibitions/transitions";
import { suggestPriority } from "@/lib/exhibitions/priority";

describe("no step back, one send back", () => {
  it("never lets a request move to an earlier stage", () => {
    const order = ["submitted", "under_review", "approved", "budget_approved", "completed", "archived"];
    for (const role of Object.keys(VALID_TRANSITIONS)) {
      for (const [from, targets] of Object.entries(VALID_TRANSITIONS[role])) {
        for (const to of targets ?? []) {
          if (!order.includes(from) || !order.includes(to)) continue;
          expect([role, from, to, order.indexOf(to) > order.indexOf(from)]).toEqual([role, from, to, true]);
        }
      }
    }
  });

  it("does not reopen a rejected request", () => {
    expect(canMove("admin", "rejected", "under_review")).toBe(false);
    expect(canMove("super_agent", "rejected", "under_review")).toBe(false);
  });

  it("lets the super agent verify straight from the queue, or send back", () => {
    expect(canMove("super_agent", "submitted", "approved")).toBe(true);
    expect(canMove("super_agent", "submitted", "revision_requested")).toBe(true);
    expect(canMove("super_agent", "approved", "under_review")).toBe(false);
  });

  it("lets the admin send back until the payment is approved", () => {
    expect(canMove("admin", "approved", "revision_requested")).toBe(true);
    expect(canMove("admin", "budget_approved", "revision_requested")).toBe(false);
  });
});

describe("payment approval to completion", () => {
  it("skips Assign resources and Mark active, and ends at completed", () => {
    expect(canMove("admin", "budget_approved", "resources_assigned")).toBe(false);
    expect(canMove("admin", "budget_approved", "completed")).toBe(true);
    expect(canMove("admin", "completed", "archived")).toBe(false);
    expect(canMove("admin", "rejected", "archived")).toBe(false);
  });

  it("tells an older archived event from an archived rejection", () => {
    expect(isSettled({ status: "archived", statusHistory: [{ status: "approved" }, { status: "completed" }, { status: "archived" }] })).toBe(true);
    expect(isSettled({ status: "archived", statusHistory: [{ status: "rejected" }, { status: "archived" }] })).toBe(false);
    expect(isSettled({ status: "completed", statusHistory: [{ status: "completed" }] })).toBe(false);
  });

  it("asks for a reason on edits only once the payment is approved", () => {
    expect(editNeedsReason("approved")).toBe(false);
    expect(editNeedsReason("budget_approved")).toBe(true);
    expect(editNeedsReason("completed")).toBe(true);
  });
});

describe("agent completion", () => {
  it("lets an agent report any approved event, including ones at the retired stages", () => {
    for (const status of ["budget_approved", "resources_assigned", "active"]) expect(canMove("agent", status, "completed")).toBe(true);
    expect(canMove("agent", "approved", "completed")).toBe(false);
    expect(canMove("agent", "active", "archived")).toBe(false);
  });

  it("waits for the event's start date", () => {
    const now = new Date("2026-10-15T09:00:00Z");
    expect(eventHasStarted("2026-10-15T00:00:00.000Z", now)).toBe(true);
    // An agent at UTC+4 on the 16th at 02:00 local is still on the 15th in UTC.
    expect(eventHasStarted("2026-10-16T00:00:00.000Z", new Date("2026-10-15T22:00:00Z"))).toBe(true);
    expect(eventHasStarted("2026-10-20T00:00:00.000Z", now)).toBe(false);
    expect(eventHasStarted(null, now)).toBe(true);
  });
});

describe("suggestPriority", () => {
  const now = new Date("2026-10-14T09:00:00Z");
  const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

  it("calls an event within a week critical", () => {
    expect(suggestPriority(inDays(5), 0, now)).toMatchObject({ priority: "critical", reason: "soon" });
  });

  it("calls an event within a month high", () => {
    expect(suggestPriority(inDays(20), 10, now)).toMatchObject({ priority: "high", reason: "thisMonth" });
  });

  it("calls 100+ expected leads high even when the event is far off", () => {
    expect(suggestPriority(inDays(90), 150, now)).toMatchObject({ priority: "high", reason: "manyLeads" });
  });

  it("calls a dated event more than a month away medium", () => {
    expect(suggestPriority(inDays(60), "40", now)).toMatchObject({ priority: "medium", reason: "standard" });
  });

  it("calls an undated request low", () => {
    expect(suggestPriority(null, 20, now)).toMatchObject({ priority: "low", reason: "noDate", daysUntil: null });
    expect(suggestPriority("not a date", 20, now).priority).toBe("low");
  });
});
