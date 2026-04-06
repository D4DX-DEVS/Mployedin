import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * POST /api/employers/[id]/verify — Admin manually verifies a company's domain
 * For companies without standard domain emails (e.g., gmail-based businesses).
 */
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findById(params?.id);
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  if (employer.domainVerified) {
    return NextResponse.json({ error: "Employer is already verified" }, { status: 409 });
  }

  employer.domainVerified = true;
  employer.domainVerifiedAt = new Date();
  await employer.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.manual_verify",
    resource: "employers",
    resourceId: params?.id,
    changes: { after: { domainVerified: true, verifiedBy: "admin_manual" } },
    req,
  });

  return NextResponse.json({
    message: "Employer domain verified manually",
    employer: {
      _id: employer._id,
      companyName: employer.companyName,
      domainVerified: employer.domainVerified,
      domainVerifiedAt: employer.domainVerifiedAt,
    },
  });
}

/**
 * DELETE /api/employers/[id]/verify — Admin revokes domain verification
 */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findById(params?.id);
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  employer.domainVerified = false;
  employer.domainVerifiedAt = undefined;
  await employer.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.revoke_verify",
    resource: "employers",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Domain verification revoked" });
}

export const POST = withAuth(postHandler, { resource: "employers", action: "approve" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "approve" });
