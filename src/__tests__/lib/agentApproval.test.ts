/**
 * @jest-environment node
 *
 * The rule behind every agent activation path: an agent nobody from staff has
 * approved before may not end up active while their email address is
 * unconfirmed (lib/auth/agentApproval.ts).
 */
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

import {
  agentEmailChangeUpdate,
  approvalStamp,
  emailChanges,
  wouldApproveUnverifiedAgent,
} from "@/lib/auth/agentApproval";

const pending = { role: "agent", isActive: false, isEmailVerified: false, email: "a@example.org" };
const APPROVED = new Date("2026-11-01T00:00:00Z");

describe("wouldApproveUnverifiedAgent", () => {
  it("blocks switching on a self-registered agent with an unconfirmed email", () => {
    expect(wouldApproveUnverifiedAgent(pending, { isActive: true })).toBe(true);
  });

  it("lets a confirmed one through", () => {
    expect(wouldApproveUnverifiedAgent({ ...pending, isEmailVerified: true }, { isActive: true })).toBe(false);
  });

  it("does not hold up switching an agent off, or editing an active one", () => {
    expect(wouldApproveUnverifiedAgent(pending, { isActive: false })).toBe(false);
    expect(wouldApproveUnverifiedAgent({ ...pending, isActive: true }, { isActive: true })).toBe(false);
  });

  it("lets staff switch back on an agent they created or approved before", () => {
    // Staff-created agents start active with no confirmed address; once
    // switched off they could otherwise never be switched on again.
    expect(wouldApproveUnverifiedAgent({ ...pending, agentApprovedAt: APPROVED }, { isActive: true })).toBe(false);
  });

  it("treats a confirmed address being replaced in the same step as unconfirmed", () => {
    const confirmed = { ...pending, isEmailVerified: true };
    expect(wouldApproveUnverifiedAgent(confirmed, { isActive: true, email: "other@example.org" })).toBe(true);
    // The same address (any case) is not a change.
    expect(wouldApproveUnverifiedAgent(confirmed, { isActive: true, email: "A@example.org" })).toBe(false);
  });

  it("blocks turning an active, unconfirmed account into an agent", () => {
    const seeker = { role: "job_seeker", isActive: true, isEmailVerified: false, email: "s@example.org" };
    expect(wouldApproveUnverifiedAgent(seeker, { role: "agent" })).toBe(true);
    expect(wouldApproveUnverifiedAgent({ ...seeker, isEmailVerified: true }, { role: "agent" })).toBe(false);
    // An inactive account made an agent is not active yet: its switch-on is checked then.
    expect(wouldApproveUnverifiedAgent({ ...seeker, isActive: false }, { role: "agent" })).toBe(false);
    expect(wouldApproveUnverifiedAgent({ ...seeker, isActive: false }, { role: "agent", isActive: true })).toBe(true);
  });

  it("leaves other roles alone", () => {
    expect(wouldApproveUnverifiedAgent({ ...pending, role: "employer" }, { isActive: true })).toBe(false);
    expect(wouldApproveUnverifiedAgent(pending, { isActive: true, role: "employer" })).toBe(false);
  });

  it("answers no for a missing account (the route answers 404 itself)", () => {
    expect(wouldApproveUnverifiedAgent(null, { isActive: true })).toBe(false);
  });
});

describe("approvalStamp", () => {
  const now = new Date("2026-11-12T12:00:00Z");

  it("stamps an agent that ends up active for the first time", () => {
    expect(approvalStamp({ ...pending, isEmailVerified: true }, { isActive: true }, now)).toEqual({ agentApprovedAt: now });
    expect(approvalStamp({ role: "job_seeker", isActive: true }, { role: "agent" }, now)).toEqual({ agentApprovedAt: now });
  });

  it("keeps the first approval time", () => {
    expect(approvalStamp({ ...pending, agentApprovedAt: APPROVED }, { isActive: true }, now)).toEqual({});
  });

  it("stamps nothing that does not end as an active agent", () => {
    expect(approvalStamp(pending, { isActive: false }, now)).toEqual({});
    expect(approvalStamp({ ...pending, role: "employer" }, { isActive: true }, now)).toEqual({});
    expect(approvalStamp(null, { isActive: true }, now)).toEqual({});
  });
});

describe("agent email changed by staff", () => {
  it("is a change only when the address differs", () => {
    expect(emailChanges(pending, "b@example.org")).toBe(true);
    expect(emailChanges(pending, " A@Example.org ")).toBe(false);
    expect(emailChanges(pending, undefined)).toBe(false);
  });

  it("marks the new address unconfirmed and drops codes and links sent to the old one", () => {
    expect(agentEmailChangeUpdate()).toEqual({
      $set: { isEmailVerified: false },
      $unset: {
        emailVerificationToken: "",
        emailVerificationOtp: "",
        emailVerificationExpiry: "",
        emailVerificationAttempts: "",
      },
    });
  });
});
