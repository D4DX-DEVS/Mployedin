/**
 * Rules for attaching an OAuth identity (LinkedIn, Apple) to a Mployedin
 * account found by email.
 *
 * Email alone is not proof of ownership. LinkedIn and Apple each tell us
 * whether they verified the address (`email_verified`), and once an account is
 * linked the provider's stable subject id is what identifies the person — a
 * second provider account that merely claims the same email is someone else.
 */

export type LinkableProvider = "linkedin" | "apple";

/** Roles whose accounts are never auto-linked from a social login. */
const NO_AUTO_LINK_ROLES = new Set(["admin", "super_agent", "agent"]);

export interface ExistingAccount {
  role: string;
  isEmailVerified?: boolean;
  hasPassword: boolean;
  linkedinSub?: string | null;
  appleSub?: string | null;
}

export type OAuthLinkDecision =
  | { allow: false; reason: "email_unverified" | "subject_mismatch" | "staff_account" }
  | {
      allow: true;
      /** Store the provider subject on the account (first link). */
      linkSubject: boolean;
      /**
       * The account was unverified and carried a password the real owner may
       * never have set (pre-account hijacking): drop it and end other sessions.
       */
      discardPassword: boolean;
    };

/** Providers send `email_verified` as a boolean or as the string "true". */
export function providerEmailVerified(profile: unknown): boolean {
  const value = (profile as { email_verified?: unknown } | null | undefined)?.email_verified;
  return value === true || value === "true";
}

export function decideOAuthLink(input: {
  provider: LinkableProvider;
  providerAccountId: string;
  emailVerified: boolean;
  existing: ExistingAccount | null;
}): OAuthLinkDecision {
  const { provider, providerAccountId, emailVerified, existing } = input;

  if (!existing) {
    return emailVerified
      ? { allow: true, linkSubject: true, discardPassword: false }
      : { allow: false, reason: "email_unverified" };
  }

  const storedSubject = provider === "linkedin" ? existing.linkedinSub : existing.appleSub;
  if (storedSubject) {
    // Already linked: the subject is the identity, not the email.
    return storedSubject === providerAccountId
      ? { allow: true, linkSubject: false, discardPassword: false }
      : { allow: false, reason: "subject_mismatch" };
  }

  if (!emailVerified) return { allow: false, reason: "email_unverified" };
  if (NO_AUTO_LINK_ROLES.has(existing.role)) return { allow: false, reason: "staff_account" };

  return {
    allow: true,
    linkSubject: true,
    discardPassword: existing.isEmailVerified !== true && existing.hasPassword,
  };
}
