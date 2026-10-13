import { NextResponse } from "next/server";
import { Employer } from "@/models/Employer";
import { User } from "@/models/User";
import { notify } from "@/lib/notifications/trigger";
import { sendEmail } from "@/lib/communications/email";
import logger from "@/lib/logger";
import { escapeHtml, sanitizeEmailSubject } from "@/lib/security/html-escape";

/** How long an emailed invite link stays usable. */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export const inviteExpiry = (): Date => new Date(Date.now() + INVITE_TTL_MS);

/**
 * A pending invite whose link has run out. The row keeps `status: "pending"`
 * in the database; this is the display/permission view of it, so the team page
 * can say "Expired" and the employer can send a fresh link.
 */
export function isInviteExpired(member: { status?: string; inviteExpiresAt?: Date | string | null }): boolean {
  if (member.status !== "pending" || !member.inviteExpiresAt) return false;
  return new Date(member.inviteExpiresAt).getTime() < Date.now();
}

/**
 * Whether this account runs its own company. Such an account can never work
 * inside someone else's: `resolveCompanyContext` always loads the company it
 * owns first, so a membership elsewhere would be accepted and then ignored.
 */
export async function ownsCompany(userId: unknown): Promise<boolean> {
  return Boolean(await Employer.exists({ userId }));
}

/**
 * Deliberately says nothing about whose account it is — an owner elsewhere, a
 * job seeker, an agent. The employer only needs to know to use another address.
 */
export const emailInUse = () =>
  NextResponse.json({ error: "This email is already in use.", code: "email_in_use" }, { status: 409 });

/**
 * Email (or, for an address that already has an account, notify) the invitee.
 *
 * Points at the public join page, not the dashboard accept page. A colleague
 * who has never used mployedin has no session, and the dashboard would bounce
 * them to login and drop the token. The join page decides: set a password and
 * join, or sign in first if they already have an account.
 */
export async function sendTeamInvite({
  email,
  inviteToken,
  companyName,
  roleName,
  locale,
  actorId,
}: {
  email: string;
  inviteToken: string;
  companyName: string;
  roleName: string;
  locale: string;
  actorId: string;
}): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const acceptPath = `/${locale}/join-team?token=${inviteToken}`;
  const acceptUrl = `${baseUrl}${acceptPath}`;
  const safeCompanyName = escapeHtml(companyName);
  const safeRoleName = escapeHtml(roleName);
  const safeAcceptUrl = escapeHtml(acceptUrl);

  const invitedUser = await User.findOne({ email }).select("_id").lean();
  if (invitedUser) {
    await notify({
      actorId,
      userId: String(invitedUser._id),
      type: "system",
      title: "Team Invitation",
      message: `You've been invited to join ${companyName} as ${roleName}`,
      link: acceptPath,
      sendEmail: true,
    });
    return;
  }

  try {
    await sendEmail({
      to: email,
      subject: sanitizeEmailSubject(`You're invited to join ${companyName} on MPLOYEDIN`),
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2>Team Invitation</h2>
          <p>You've been invited to join <strong>${safeCompanyName}</strong> as a <strong>${safeRoleName}</strong> on MPLOYEDIN.</p>
          <p>This invitation expires in 48 hours.</p>
          <a href="${safeAcceptUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept Invitation</a> <!-- nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format -- safeAcceptUrl is HTML attribute-escaped above -->
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">If you didn't expect this invitation, you can safely ignore this email.</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error({ err }, "[team.invite] Email send failed");
  }
}

/** "hiring_manager" -> "hiring manager", for the invite copy. */
export const roleNames = (roles: string[]): string => roles.map((r) => r.replace("_", " ")).join(", ");
