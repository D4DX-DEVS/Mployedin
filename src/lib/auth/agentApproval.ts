import { NextResponse } from "next/server";
import User from "@/models/User";

/** API refusal code; the UI maps it to `formErrors.agentEmailNotVerified`. */
export const AGENT_EMAIL_NOT_VERIFIED = "AGENT_EMAIL_NOT_VERIFIED";

export const AGENT_EMAIL_NOT_VERIFIED_MESSAGE =
  "This agent has not confirmed their email address yet. They can be approved once they have.";

export interface ApprovalAccountState {
  role?: string | null;
  isActive?: boolean | null;
  isEmailVerified?: boolean | null;
  email?: string | null;
  /** Set when staff first created or approved this account as an active agent. */
  agentApprovedAt?: Date | null;
}

/** What a request is about to change on the account. */
export interface ApprovalChange {
  isActive?: boolean;
  role?: string | null;
  email?: string | null;
}

/** The fields the checks below read; select them when loading the account. */
export const APPROVAL_STATE_FIELDS = "role isActive isEmailVerified email agentApprovedAt";

/** Whether `nextEmail` replaces the account's address (case and spaces ignored). */
export function emailChanges(current: ApprovalAccountState | null | undefined, nextEmail: string | null | undefined): boolean {
  if (typeof nextEmail !== "string") return false;
  return nextEmail.trim().toLowerCase() !== String(current?.email ?? "").trim().toLowerCase();
}

/**
 * Whether the change would approve an agent whose email address nobody has
 * confirmed. A self-registered agent waits inactive for approval, and anyone
 * can register with someone else's address.
 *
 * Counts as approval: switching an agent on, or making an active account an
 * agent. Not: editing an active agent, switching anyone off, or switching back
 * on an agent staff created or approved before (`agentApprovedAt`) — a
 * staff-created agent starts active with an address nobody confirmed. A
 * confirmed address replaced in the same request is unconfirmed.
 */
export function wouldApproveUnverifiedAgent(
  current: ApprovalAccountState | null | undefined,
  change: ApprovalChange = {},
): boolean {
  if (!current) return false;
  const role = change.role ?? current.role;
  if (role !== "agent") return false;
  if (current.agentApprovedAt) return false;
  const turningOn = change.isActive === true && current.isActive !== true;
  const becomingActiveAgent = current.role !== "agent" && (change.isActive ?? current.isActive) === true;
  if (!turningOn && !becomingActiveAgent) return false;
  const confirmed = current.isEmailVerified === true && !emailChanges(current, change.email);
  return !confirmed;
}

/**
 * `{ agentApprovedAt }` to `$set` when the change leaves an active agent that
 * was never stamped; otherwise nothing. The first approval time is kept.
 */
export function approvalStamp(
  current: ApprovalAccountState | null | undefined,
  change: ApprovalChange = {},
  now: Date = new Date(),
): { agentApprovedAt?: Date } {
  if (!current || current.agentApprovedAt) return {};
  const role = change.role ?? current.role;
  const active = change.isActive ?? current.isActive;
  return role === "agent" && active === true ? { agentApprovedAt: now } : {};
}

/**
 * Staff replaced an agent's address: nobody has proved the new one, and codes
 * or links already sent went to the old one.
 */
export function agentEmailChangeUpdate(): { $set: { isEmailVerified: false }; $unset: Record<string, ""> } {
  return {
    $set: { isEmailVerified: false },
    $unset: {
      emailVerificationToken: "",
      emailVerificationOtp: "",
      emailVerificationExpiry: "",
      emailVerificationAttempts: "",
    },
  };
}

/** Loads what the checks above read. */
export async function loadApprovalState(userId: unknown): Promise<ApprovalAccountState | null> {
  return (await User.findById(userId).select(APPROVAL_STATE_FIELDS).lean()) as ApprovalAccountState | null;
}

/** 422 with the refusal code: a 409 reads as "email in use" in the agent forms. */
export function agentEmailNotVerifiedResponse(): NextResponse {
  return NextResponse.json(
    { error: AGENT_EMAIL_NOT_VERIFIED_MESSAGE, code: AGENT_EMAIL_NOT_VERIFIED },
    { status: 422 },
  );
}
