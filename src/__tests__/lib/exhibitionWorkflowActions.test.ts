/**
 * The admin exhibition queue offers, per request, a forward step plus
 * send-back / reject / start-review. Every one must be a move the PATCH route
 * accepts: the inspector used to send "approved" from any status, so Approve
 * failed with a 400 on every request past the first review.
 */
import { VALID_TRANSITIONS, adminCanMove } from "@/lib/exhibitions/transitions";
import { adminWorkflowActions } from "@/app/[locale]/(dashboard)/admin/exhibitions/_lib/workflowActions";

const STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "revision_requested",
  "approved",
  "budget_approved",
  "resources_assigned",
  "active",
  "completed",
  "rejected",
  "archived",
  "cancelled",
];

describe("admin exhibition workflow actions", () => {
  it.each(STATUSES)("offers only moves the API accepts from %s", (status) => {
    const { next, others } = adminWorkflowActions(status);
    for (const action of [next, ...others].filter(Boolean)) {
      expect(adminCanMove(status, action!.status)).toBe(true);
    }
  });

  it("offers a forward step from every status an admin can move", () => {
    for (const status of Object.keys(VALID_TRANSITIONS.admin)) {
      expect(adminWorkflowActions(status).next).not.toBeNull();
    }
  });

  it("asks for the budget step, not a second approval, once a request is approved", () => {
    expect(adminWorkflowActions("approved").next?.status).toBe("budget_approved");
    expect(adminWorkflowActions("budget_approved").next?.status).toBe("resources_assigned");
  });

  it("offers reject and send-back only where the server allows them", () => {
    const keys = (status: string) => adminWorkflowActions(status).others.map((action) => action.key);
    expect(keys("under_review")).toEqual(["send-back", "reject"]);
    expect(keys("budget_approved")).toEqual([]);
    expect(keys("archived")).toEqual([]);
  });
});
