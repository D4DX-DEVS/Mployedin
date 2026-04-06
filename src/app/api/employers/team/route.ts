import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { teamInviteSchema } from "@/lib/validators/team";
import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import { User } from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { sendEmail } from "@/lib/communications/email";
import { canManageTeam } from "@/lib/permissions/team";

/**
 * GET /api/employers/team — list team members for the employer's company
 */
async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  // Verify caller is owner or admin
  const callerMember = await CompanyUser.findOne({
    companyId: employer._id,
    userId: ctx.userId,
    status: "active",
  }).lean();

  if (!callerMember || !canManageTeam(callerMember.companyRole)) {
    return NextResponse.json({ error: "Only owners and admins can view team" }, { status: 403 });
  }

  const members = await CompanyUser.find({ companyId: employer._id })
    .sort({ status: 1, companyRole: 1, createdAt: -1 })
    .lean();

  // Enrich with user names
  const userIds = members.filter((m) => m.userId).map((m) => m.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email avatar")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const enriched = members.map((m) => ({
    ...m,
    user: m.userId ? userMap.get(String(m.userId)) ?? null : null,
  }));

  return NextResponse.json({ members: enriched });
}

/**
 * POST /api/employers/team — invite a new team member
 */
async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, teamInviteSchema);

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id companyName").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  // Verify caller can manage team
  const callerMember = await CompanyUser.findOne({
    companyId: employer._id,
    userId: ctx.userId,
    status: "active",
  }).lean();

  if (!callerMember || !canManageTeam(callerMember.companyRole)) {
    return NextResponse.json({ error: "Insufficient permissions to invite" }, { status: 403 });
  }

  // Cannot invite owner role
  if ((body as { companyRole: string }).companyRole === "owner") {
    return NextResponse.json({ error: "Cannot invite as owner" }, { status: 400 });
  }

  // Admin cannot invite another admin (only owner can)
  if (callerMember.companyRole === "admin" && (body as { companyRole: string }).companyRole === "admin") {
    return NextResponse.json({ error: "Only owners can invite admins" }, { status: 403 });
  }

  const { email, companyRole, jobAccess, permissions: customPerms } = body as {
    email: string;
    companyRole: "admin" | "hiring_manager" | "viewer";
    jobAccess?: string[];
    permissions?: Record<string, boolean>;
  };

  // Check if already a member
  const existing = await CompanyUser.findOne({ companyId: employer._id, email });
  if (existing) {
    if (existing.status === "deactivated") {
      // Reactivate
      existing.status = "pending";
      existing.companyRole = companyRole;
      existing.inviteToken = randomBytes(32).toString("hex");
      existing.inviteExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      existing.invitedBy = ctx.userId as unknown as typeof existing.invitedBy;
      existing.invitedAt = new Date();
      await existing.save();

      return NextResponse.json({ member: existing, reactivated: true }, { status: 200 });
    }
    return NextResponse.json({ error: "User is already a team member" }, { status: 409 });
  }

  // Check for max team size (prevent abuse)
  const memberCount = await CompanyUser.countDocuments({
    companyId: employer._id,
    status: { $ne: "deactivated" },
  });
  if (memberCount >= 50) {
    return NextResponse.json({ error: "Team size limit reached (50)" }, { status: 400 });
  }

  const inviteToken = randomBytes(32).toString("hex");
  const defaultPermissions = getDefaultPermissions(companyRole);
  const finalPermissions = customPerms
    ? { ...defaultPermissions, ...customPerms }
    : defaultPermissions;

  // Check if the invited email matches an existing user
  const existingUser = await User.findOne({ email }).select("_id").lean();

  const member = await CompanyUser.create({
    companyId: employer._id,
    userId: existingUser?._id ?? undefined,
    email,
    companyRole,
    jobAccess: jobAccess ?? [],
    permissions: finalPermissions,
    invitedBy: ctx.userId,
    inviteToken,
    inviteExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
    invitedAt: new Date(),
    status: "pending",
  });

  // Send invite notification/email
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const acceptUrl = `${baseUrl}/en/employer/team/accept?token=${inviteToken}`;
  const roleName = companyRole.replace("_", " ");

  if (existingUser) {
    await notify({
      userId: String(existingUser._id),
      type: "system",
      title: "Team Invitation",
      message: `You've been invited to join ${employer.companyName} as ${roleName}`,
      link: `/en/employer/team/accept?token=${inviteToken}`,
      sendEmail: true,
    });
  } else {
    // Send email directly to non-registered invitee
    try {
      await sendEmail({
        to: email,
        subject: `You're invited to join ${employer.companyName} on mployedin`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
            <h2>Team Invitation</h2>
            <p>You've been invited to join <strong>${employer.companyName}</strong> as a <strong>${roleName}</strong> on mployedin.</p>
            <p>This invitation expires in 48 hours.</p>
            <a href="${acceptUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept Invitation</a>
            <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch (err) {
      console.error("[team.invite] Email send failed:", err);
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "team.invite",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { after: { email, companyRole } },
    req,
  });

  return NextResponse.json({ member }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
