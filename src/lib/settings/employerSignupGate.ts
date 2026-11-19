/**
 * Who may use the public employer sign-up (/employer-register + its API).
 *
 * - No invite code: only while the admin has public employer registration ON.
 * - With an invite code: only while employer invite links are ON and the code is
 *   a live employer invite (an active, unexpired, not-used-up employer-audience
 *   ReferralLink, or an agent / super-agent personal referral code).
 *
 * Read-only: the register route still claims a ReferralLink use atomically.
 */
import connectDB from "@/lib/db/mongoose";
import ReferralLink from "@/models/ReferralLink";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { getEmployerOnboardingFlags } from "@/lib/settings/employerOnboarding";

export type EmployerInviteStatus = "valid" | "invalid" | "paused";

export type EmployerSignupDecision =
  | { allowed: true }
  | { allowed: false; code: "EMPLOYER_SIGNUP_CLOSED" | "EMPLOYER_INVITE_INVALID" | "EMPLOYER_INVITES_PAUSED" };

/** Is this code a live employer invite? Ignores the admin switch (see checkEmployerSignup). */
export async function isLiveEmployerInvite(code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed || trimmed.length > 100) return false;
  await connectDB();
  const link = await ReferralLink.findOne({ code: trimmed, isActive: true, audience: { $ne: "job_seeker" } })
    .select("expiresAt maxUses usedCount")
    .lean<{ expiresAt?: Date; maxUses?: number; usedCount?: number } | null>();
  if (link) {
    if (link.expiresAt && link.expiresAt < new Date()) return false;
    if ((link.maxUses ?? 0) > 0 && (link.usedCount ?? 0) >= (link.maxUses ?? 0)) return false;
    return true;
  }
  const [agent, superAgent] = await Promise.all([
    Agent.exists({ referralCode: trimmed }),
    SuperAgent.exists({ referralCode: trimmed }),
  ]);
  return Boolean(agent || superAgent);
}

/** Status of an invite code for the sign-up page, under the current admin switches. */
export async function employerInviteStatus(code: string): Promise<EmployerInviteStatus> {
  const flags = await getEmployerOnboardingFlags();
  if (!flags.employerInviteLinksEnabled) return "paused";
  return (await isLiveEmployerInvite(code)) ? "valid" : "invalid";
}

/** May this public employer sign-up go ahead? */
export async function checkEmployerSignup(referralCode: string | null | undefined): Promise<EmployerSignupDecision> {
  const code = (referralCode ?? "").trim();
  if (!code) {
    const flags = await getEmployerOnboardingFlags();
    return flags.employerSelfRegistrationEnabled ? { allowed: true } : { allowed: false, code: "EMPLOYER_SIGNUP_CLOSED" };
  }
  const status = await employerInviteStatus(code);
  if (status === "valid") return { allowed: true };
  // Public sign-up is open: a bad or paused code no longer blocks, it just isn't a referral.
  const flags = await getEmployerOnboardingFlags();
  if (flags.employerSelfRegistrationEnabled) return { allowed: true };
  return { allowed: false, code: status === "paused" ? "EMPLOYER_INVITES_PAUSED" : "EMPLOYER_INVITE_INVALID" };
}
