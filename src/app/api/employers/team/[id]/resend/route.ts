import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import { connectDB } from "@/lib/db/mongoose";
import { CompanyUser } from "@/models/CompanyUser";
import type { CompanyRole } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import { User } from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { actingUserId, canModifyMember, getTeamActorRole } from "@/lib/permissions/team";
import { isValidObjectId } from "@/lib/security/sanitize";
import { emailInUse, inviteExpiry, ownsCompany, roleNames, sendTeamInvite } from "@/lib/employers/teamInvite";

/**
 * POST /api/employers/team/[id]/resend — send a fresh invite link.
 *
 * Works on a pending invite (expired or not) and on a cancelled/deactivated
 * row, keeping the roles, job access and ticks already on it. The old link
 * stops working because the token is replaced.
 */
async function postHandler(
  req: NextRequest,
  ctx: { userId: string; role: string; member?: AuthContext["member"] },
  params?: Record<string, string>
) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberId = params?.id;
  if (!isValidObjectId(memberId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id companyName companyEmail").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const actorRole = await getTeamActorRole(ctx, employer);
  if (!actorRole) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const target = await CompanyUser.findOne({ _id: memberId, companyId: employer._id });
  if (!target) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }
  if (target.companyRole === "owner") {
    return NextResponse.json({ error: "Cannot modify the owner" }, { status: 403 });
  }
  if (target.status === "active") {
    return NextResponse.json({ error: "This person is already on the team", code: "already_member" }, { status: 409 });
  }
  if (target.userId && String(target.userId) === actingUserId(ctx)) {
    return NextResponse.json({ error: "You cannot change your own access" }, { status: 403 });
  }

  const roles = (target.companyRoles?.length ? target.companyRoles : [target.companyRole]) as CompanyRole[];
  if (!canModifyMember(actorRole, roles)) {
    return NextResponse.json({ error: "Cannot modify this member" }, { status: 403 });
  }

  // Same rule as a new invite: an address with an account can only come back
  // if that account is this row's own former member and runs no company of
  // its own. Anyone else could open the link and never get in.
  const existingUser = await User.findOne({ email: target.email }).select("_id").lean();
  if (existingUser) {
    const isReturningMember =
      Boolean(target.userId) && String(target.userId) === String(existingUser._id);
    if (!isReturningMember || (await ownsCompany(existingUser._id))) {
      return emailInUse();
    }
  }

  if (target.status === "deactivated") {
    const memberCount = await CompanyUser.countDocuments({
      companyId: employer._id,
      status: { $ne: "deactivated" },
    });
    if (memberCount >= 50) {
      return NextResponse.json({ error: "Team size limit reached (50)" }, { status: 400 });
    }
  }

  const wasStatus = target.status;
  target.status = "pending";
  target.inviteToken = randomBytes(32).toString("hex");
  target.inviteExpiresAt = inviteExpiry();
  target.invitedBy = ctx.userId as unknown as typeof target.invitedBy;
  target.invitedAt = new Date();
  await target.save();

  const locale = req.headers.get("referer")?.match(/\/(en|ar)(\/|$)/)?.[1] ?? "en";
  await sendTeamInvite({
    email: target.email,
    inviteToken: target.inviteToken,
    companyName: employer.companyName,
    roleName: roleNames(roles),
    locale,
    actorId: ctx.userId,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "team.resend_invite",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { before: { status: wasStatus }, after: { email: target.email, status: "pending" } },
    req,
  });

  return NextResponse.json({ member: { _id: String(target._id), email: target.email, status: target.status } });
}

export const POST = withAuth(
  withSubscription(postHandler, { type: "limit", feature: "teamMembers" }),
);
