/**
 * Client feedback 2026-10-14: reviewers had no way back a stage, the agent
 * could not mark an event completed, and priority had no criteria. These pin
 * the rules the API and the screens share.
 */
import { STEP_BACK, VALID_TRANSITIONS, canMove, entryIntoStatus, isStepBack, superAgentOwnsCurrentDecision } from "@/lib/exhibitions/transitions";
import { suggestPriority } from "@/lib/exhibitions/priority";
import { adminWorkflowActions } from "@/app/[locale]/(dashboard)/admin/exhibitions/_lib/workflowActions";

describe("step back", () => {
  it.each(Object.entries(STEP_BACK))("admin can step %s back to %s", (from, to) => {
    expect(canMove("admin", from, to!)).toBe(true);
    expect(isStepBack(from, to!)).toBe(true);
  });

  it("offers the admin drawer a back step only where one exists", () => {
    expect(adminWorkflowActions("budget_approved").back).toBe("approved");
    expect(adminWorkflowActions("completed").back).toBe("active");
    expect(adminWorkflowActions("submitted").back).toBeNull();
    expect(adminWorkflowActions("archived").back).toBeNull();
  });

  it("lets a super agent undo only its own stage", () => {
    expect(canMove("super_agent", "approved", "under_review")).toBe(true);
    expect(canMove("super_agent", "budget_approved", "approved")).toBe(false);
    expect(canMove("super_agent", "completed", "active")).toBe(false);
  });

  it("does not count a forward move as a step back", () => {
    expect(isStepBack("approved", "budget_approved")).toBe(false);
  });
});

describe("agent completion", () => {
  it("lets an agent move only a live event to completed", () => {
    expect(VALID_TRANSITIONS.agent).toEqual({ active: ["completed"] });
    expect(canMove("agent", "active", "completed")).toBe(true);
    expect(canMove("agent", "resources_assigned", "completed")).toBe(false);
    expect(canMove("agent", "active", "archived")).toBe(false);
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

describe("super agent ownership of the current decision", () => {
  it("reads the move into the status, not a later priority note at that status", () => {
    const item = {
      status: "rejected",
      statusHistory: [
        { status: "under_review", approverRole: "super_agent" },
        { status: "rejected", approverRole: "admin" },
        { status: "rejected", approverRole: "super_agent" }, // priority change
      ],
    };
    expect(entryIntoStatus(item.statusHistory, "rejected")?.approverRole).toBe("admin");
    expect(superAgentOwnsCurrentDecision(item)).toBe(false);
  });

  it("lets a super agent undo their own approval but not the admin's", () => {
    expect(superAgentOwnsCurrentDecision({ status: "approved", statusHistory: [{ status: "approved", approverRole: "super_agent" }] })).toBe(true);
    expect(superAgentOwnsCurrentDecision({ status: "approved", statusHistory: [{ status: "submitted" }, { status: "approved", approverRole: "admin" }] })).toBe(false);
    expect(superAgentOwnsCurrentDecision({ status: "under_review", statusHistory: [] })).toBe(false);
  });
});
