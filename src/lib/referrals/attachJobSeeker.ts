import type { NextRequest } from "next/server";
import ReferralLink from "@/models/ReferralLink";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { logActivity } from "@/lib/audit/log";
import { notifyReferrerJobSeekerRegistered } from "@/lib/notifications/trigger";
import { REFERRAL_CODE_RE } from "@/lib/referrals/url";
import logger from "@/lib/logger";

/**
 * The single place a job seeker acquires a referral. Several signup paths call
 * it (email body, Firebase credential, OAuth cookie, email-OTP quick apply). It
 * never throws for a business reason and never blocks a signup: every failure
 * is a reason code.
 */

/** OAuth cookie path: a returning user must not be able to claim a code. */
export const DEFAULT_MAX_ACCOUNT_AGE_MS = 15 * 60 * 1000;

export type AttachFailureReason =
  | "invalid_code"
  | "not_found"
  | "wrong_audience"
  | "inactive"
  | "expired"
  | "max_reached"
  | "already_referred"
  | "no_profile"
  | "account_too_old";

export type AttachResult =
  | { attached: true; linkId: string; referrerRole: "agent" | "super_agent" }
  | { attached: false; reason: AttachFailureReason };

interface LeanLink {
  _id: unknown;
  code: string;
  audience?: string;
  isActive: boolean;
  expiresAt?: Date | string | null;
  maxUses: number;
  createdBy: unknown;
  creatorRole: "agent" | "super_agent";
  agentId?: unknown;
  superAgentId?: unknown;
}

interface LeanSeeker {
  _id: unknown;
  fullName?: string;
  createdAt?: Date | string;
  referral?: unknown;
}

export async function attachJobSeekerReferral(input: {
  userId: string;
  code: string | null | undefined;
  maxAccountAgeMs?: number;
  req?: NextRequest;
}): Promise<AttachResult> {
  const code = (input.code ?? "").trim().toUpperCase();
  if (!code || !REFERRAL_CODE_RE.test(code)) return { attached: false, reason: "invalid_code" };

  const link = (await ReferralLink.findOne({ code }).lean()) as LeanLink | null;
  if (!link) return { attached: false, reason: "not_found" };
  if (link.audience !== "job_seeker") return { attached: false, reason: "wrong_audience" };
  if (!link.isActive) return { attached: false, reason: "inactive" };
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return { attached: false, reason: "expired" };

  const seeker = (await JobSeeker.findOne({ userId: input.userId })
    .select("_id fullName createdAt referral")
    .lean()) as LeanSeeker | null;
  if (!seeker) return { attached: false, reason: "no_profile" };
  if (seeker.referral) return { attached: false, reason: "already_referred" };

  const maxAge = input.maxAccountAgeMs ?? DEFAULT_MAX_ACCOUNT_AGE_MS;
  if (seeker.createdAt && Date.now() - new Date(seeker.createdAt).getTime() > maxAge) {
    return { attached: false, reason: "account_too_old" };
  }

  const user = (await User.findById(input.userId).select("name email").lean()) as
    | { name?: string; email?: string }
    | null;
  const name = seeker.fullName || user?.name || "";
  const email = user?.email ?? "";

  // Consume + record in ONE update so usedCount and registrations never disagree,
  // and so maxUses is enforced inside the filter (no read-then-write window).
  const consumeFilter: Record<string, unknown> = { _id: link._id, isActive: true };
  if (link.maxUses > 0) consumeFilter.usedCount = { $lt: link.maxUses };
  const consumed = await ReferralLink.findOneAndUpdate(
    consumeFilter,
    {
      $inc: { usedCount: 1 },
      $push: {
        registrations: {
          kind: "job_seeker",
          jobSeekerId: seeker._id,
          userId: input.userId,
          name,
          email,
          registeredAt: new Date(),
        },
      },
    },
    { new: false },
  );
  if (!consumed) return { attached: false, reason: "max_reached" };

  const referral = {
    linkId: link._id,
    code: link.code,
    ...(link.agentId ? { agentId: link.agentId } : {}),
    ...(link.superAgentId ? { superAgentId: link.superAgentId } : {}),
    referrerUserId: link.createdBy,
    referrerRole: link.creatorRole,
    referredAt: new Date(),
  };

  const write = await JobSeeker.updateOne(
    { _id: seeker._id, referral: { $exists: false } },
    { $set: { referral, isAgentReferred: true } },
  );
  if (write.matchedCount === 0) {
    // A concurrent claim stamped the seeker first. Give the link its use back.
    await ReferralLink.updateOne(
      { _id: link._id },
      { $inc: { usedCount: -1 }, $pull: { registrations: { jobSeekerId: seeker._id } } },
    );
    return { attached: false, reason: "already_referred" };
  }

  await logActivity({
    actorId: input.userId,
    actorRole: "job_seeker",
    action: "referral.job_seeker_attached",
    resource: "referral_links",
    resourceId: String(link._id),
    meta: { code: link.code, jobSeekerId: String(seeker._id), referrerRole: link.creatorRole },
    ...(input.req ? { req: input.req } : {}),
  });

  await notifyReferrerJobSeekerRegistered(
    String(link.createdBy),
    link.creatorRole,
    name || email,
    String(seeker._id),
  ).catch((err) => logger.error({ err, linkId: String(link._id) }, "Referral: could not notify the link owner"));

  return { attached: true, linkId: String(link._id), referrerRole: link.creatorRole };
}
