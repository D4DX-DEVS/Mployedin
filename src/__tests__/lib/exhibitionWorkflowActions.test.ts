/**
 * The admin exhibition queue offers, per request, a forward step plus
 * send-back / reject. Every one must be a move the PATCH route
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

  it("offers a forward step from every status an admin can move on from", () => {
    for (const [status, targets] of Object.entries(VALID_TRANSITIONS.admin)) {
      if ((targets ?? []).some((to) => to !== "rejected" && to !== "revision_requested")) {
        expect(adminWorkflowActions(status).next).not.toBeNull();
      }
    }
  });

  it("asks for the payment step, not a second approval, once a request is approved", () => {
    expect(adminWorkflowActions("approved").next).toMatchObject({ status: "budget_approved", labelKey: "approvePayment" });
  });

  it("goes from payment approval straight to the event report, which is final", () => {
    // Owner, 2026-10-15: no Assign resources or Mark active, and no Settle
    // balance or Archive after the event.
    for (const status of ["budget_approved", "resources_assigned", "active"]) {
      expect(adminWorkflowActions(status).next?.status).toBe("completed");
    }
    expect(adminWorkflowActions("completed")).toEqual({ next: null, others: [] });
    expect(adminWorkflowActions("rejected")).toEqual({ next: null, others: [] });
  });

  it("offers reject and send-back only where the server allows them", () => {
    const keys = (status: string) => adminWorkflowActions(status).others.map((action) => action.key);
    expect(keys("under_review")).toEqual(["send-back", "reject"]);
    expect(keys("submitted")).toEqual(["send-back", "reject"]);
    // Past the payment approval a request can still be called off, not sent back.
    expect(keys("budget_approved")).toEqual(["reject"]);
    expect(keys("completed")).toEqual([]);
    expect(keys("archived")).toEqual([]);
  });
});
