import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { domainVerifyRequestSchema } from "@/lib/validators/team";
import { Employer } from "@/models/Employer";
import { CompanyUser } from "@/models/CompanyUser";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canManageTeam } from "@/lib/permissions/team";
import { sendEmail } from "@/lib/communications/email";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import logger from "@/lib/logger";

/**
 * POST /api/employers/verify-domain — send domain verification email
 */
async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: max 3 per day
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = await checkRateLimit(`domain-verify:${ctx.userId}`, {
    limit: 3,
    windowSec: 24 * 60 * 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit: max 3 verification emails per day" }, { status: 429 });
  }

  const { domain } = (await validateBody(req, domainVerifyRequestSchema)) as { domain: string };

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId })
    .select("+domainVerificationToken");
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  if (employer.domainVerified) {
    return NextResponse.json({ error: "Domain already verified" }, { status: 400 });
  }

  // Verify caller is owner or admin
  const callerMember = await CompanyUser.findOne({
    companyId: employer._id,
    userId: ctx.userId,
    status: "active",
  }).lean();

  if (!callerMember || !canManageTeam(callerMember.companyRole)) {
    return NextResponse.json({ error: "Only owners and admins can verify domain" }, { status: 403 });
  }

  const token = randomBytes(32).toString("hex");
  employer.domainVerificationToken = token;
  employer.domainVerificationSentAt = new Date();
  await employer.save();

  // Send verification email to admin@domain
  const verifyEmail = `admin@${domain}`;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const confirmUrl = `${baseUrl}/api/employers/verify-domain/confirm?token=${token}`;

  try {
    await sendEmail({
      to: verifyEmail,
      subject: `Domain Verification for ${employer.companyName} — Mployedin`,
      html: `
        <h2>Domain Verification</h2>
        <p>${employer.companyName} is requesting domain verification on Mployedin.</p>
        <p>Click below to verify ownership of <strong>${domain}</strong>:</p>
        <p><a href="${confirmUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Verify Domain</a></p>
        <p>This link expires in 48 hours.</p>
        <p>If you did not request this, please ignore this email.</p>
      `,
    });
  } catch (err) {
    logger.error({ err }, "[Domain Verify] Email send failed");
    return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.domain_verify_request",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { after: { domain, email: verifyEmail } },
    req,
  });

  return NextResponse.json({
    success: true,
    message: `Verification email sent to ${verifyEmail}`,
  });
}

export const POST = withAuth(postHandler);
