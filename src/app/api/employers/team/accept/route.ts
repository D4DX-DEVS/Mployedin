import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { teamAcceptSchema } from "@/lib/validators/team";
import { CompanyUser } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

/**
 * POST /api/employers/team/accept — accept a team invitation
 */
async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { allowed } = await checkRateLimit(`team-accept:${ctx.userId}`, RATE_LIMIT_CONFIGS.auth);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const { token } = (await validateBody(req, teamAcceptSchema)) as { token: string };

  await connectDB();

  // Find the invite by token (explicitly select the inviteToken field)
  const member = await CompanyUser.findOne({ inviteToken: token, status: "pending" })
    .select("+inviteToken");

  if (!member) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  }

  // Check expiry
  if (member.inviteExpiresAt && new Date() > member.inviteExpiresAt) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  // Verify the accepting user's email matches the invite
  const { User } = await import("@/models/User");
  const user = await User.findById(ctx.userId).select("email").lean();
  if (!user || user.email !== member.email) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    );
  }

  // Activate the membership
  member.userId = ctx.userId as unknown as typeof member.userId;
  member.status = "active";
  member.acceptedAt = new Date();
  member.inviteToken = undefined;
  member.inviteExpiresAt = undefined;
  await member.save();

  const employer = await Employer.findById(member.companyId).select("companyName").lean();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "team.accept_invite",
    resource: "employers",
    resourceId: String(member.companyId),
    changes: { after: { email: member.email, companyRole: member.companyRole } },
    req,
  });

  return NextResponse.json({
    success: true,
    companyName: employer?.companyName ?? "Company",
    companyRole: member.companyRole,
  });
}

export const POST = withAuth(postHandler);
