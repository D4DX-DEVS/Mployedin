import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * POST /api/employers/[id]/verify — Admin manually verifies a company's domain
 * For companies without standard domain emails (e.g., gmail-based businesses).
 */
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: params?.id });
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  if (employer.domainVerified) {
    return NextResponse.json({ error: "Employer is already verified" }, { status: 409 });
  }

  // M-2 (KYC): require at least one verification document before approving,
  // unless the admin explicitly overrides with a documented reason.
  const body = (await req.json().catch(() => ({}))) as { override?: boolean; reason?: string };
  const hasDocuments = Array.isArray(employer.verificationDocs) && employer.verificationDocs.length > 0;
  if (!hasDocuments && !body.override) {
    return NextResponse.json(
      {
        error:
          "No verification documents on file. Upload at least one document, or confirm an override with a reason.",
        code: "NO_VERIFICATION_DOCS",
      },
      { status: 422 },
    );
  }
  const overridden = !hasDocuments && Boolean(body.override);

  employer.domainVerified = true;
  employer.domainVerifiedAt = new Date();
  employer.verificationLevel = "company";
  employer.verifiedAt = new Date();
  employer.verifiedBy = new (await import("mongoose")).default.Types.ObjectId(ctx.userId);
  await employer.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.manual_verify",
    resource: "employers",
    resourceId: params?.id,
    changes: {
      after: {
        domainVerified: true,
        verifiedBy: "admin_manual",
        documentCount: employer.verificationDocs?.length ?? 0,
        overridden,
        ...(overridden && body.reason ? { overrideReason: body.reason } : {}),
      },
    },
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
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: params?.id });
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
