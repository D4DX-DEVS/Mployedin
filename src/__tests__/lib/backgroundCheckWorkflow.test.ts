/**
 * @jest-environment node
 *
 * The pure rules of the background-check workflow (owner decision 2026-10-14):
 * what each viewer may do, what a verdict needs as evidence, and which check
 * kinds overlap. The guarded database writes are exercised against a real
 * MongoDB separately (concurrent claims, holder-only writes).
 */
jest.mock("@/models/BackgroundCheck", () => ({ __esModule: true, default: {} }));

import { checkTypesOverlap, completionProblem, viewerFlags, type CheckActor } from "@/lib/backgroundChecks/workflow";

const ME = "651000000000000000000001";
const OTHER = "651000000000000000000002";
const agent: CheckActor = { userId: ME, side: "staff", canManage: false, canPerform: true };
const owner: CheckActor = { userId: ME, side: "employer", canManage: true, canPerform: true };
const colleague: CheckActor = { userId: ME, side: "employer", canManage: false, canPerform: true };
const follower: CheckActor = { userId: ME, side: "staff", canManage: false, canPerform: false };

describe("viewerFlags", () => {
  it("lets anyone who runs checks start one nobody holds", () => {
    for (const actor of [agent, owner, colleague]) {
      expect(viewerFlags({ status: "pending" }, actor).canStart).toBe(true);
    }
    expect(viewerFlags({ status: "pending" }, follower).canStart).toBe(false);
  });

  it("lets the holder start a check handed to them, then work it", () => {
    expect(viewerFlags({ status: "pending", assignedTo: ME }, agent)).toMatchObject({ canStart: true, canWork: false });
    expect(viewerFlags({ status: "in_progress", assignedTo: ME }, agent)).toMatchObject({ canStart: false, canWork: true });
  });

  it("leaves a held check read-only for everyone else, the owner included", () => {
    const flags = viewerFlags({ status: "in_progress", assignedTo: { _id: OTHER } }, owner);
    expect(flags).toMatchObject({ canStart: false, canWork: false, heldByOther: true, canAssign: true });
  });

  it("only the employer side assigns, cancels and edits notes", () => {
    expect(viewerFlags({ status: "pending" }, agent)).toMatchObject({ canAssign: false, canCancel: false, canEditNotes: false });
    expect(viewerFlags({ status: "pending" }, colleague)).toMatchObject({ canAssign: false, canCancel: false, canEditNotes: true });
    expect(viewerFlags({ status: "pending" }, owner)).toMatchObject({ canAssign: true, canCancel: true, canEditNotes: true });
  });

  it("closes everything but notes once a check is completed or cancelled", () => {
    for (const status of ["completed", "cancelled"]) {
      expect(viewerFlags({ status, assignedTo: ME }, owner)).toEqual({
        canStart: false,
        canWork: false,
        canAssign: false,
        canCancel: false,
        canEditNotes: true,
        heldByOther: false,
      });
    }
  });
});

describe("completionProblem", () => {
  const refs = (statuses: string[]) => statuses.map((status) => ({ status }));

  it("needs a summary for every verdict", () => {
    expect(completionProblem({ status: "in_progress", checkType: "background" }, "flagged", "  ")?.code).toBe("needs_summary");
  });

  it("won't mark references clear until a referee replied", () => {
    const check = { status: "in_progress", checkType: "reference", references: refs(["requested", "declined"]) };
    expect(completionProblem(check, "clear", "Called both")?.code).toBe("needs_reply");
    expect(completionProblem({ ...check, references: refs(["responded"]) }, "clear", "Confirmed")).toBeNull();
  });

  it("allows an honest unable-to-verify without a reply", () => {
    const check = { status: "in_progress", checkType: "both", references: refs(["declined"]) };
    expect(completionProblem(check, "unable_to_verify", "Referee declined")).toBeNull();
  });

  it("refuses a pending verdict", () => {
    expect(completionProblem({ status: "in_progress" }, "pending", "x")?.code).toBe("needs_outcome");
  });
});

describe("checkTypesOverlap", () => {
  it("treats the same kind, or 'both', as overlapping", () => {
    expect(checkTypesOverlap("reference", "reference")).toBe(true);
    expect(checkTypesOverlap("both", "background")).toBe(true);
    expect(checkTypesOverlap("reference", "both")).toBe(true);
    expect(checkTypesOverlap("reference", "background")).toBe(false);
  });
});
