import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { employerUpdateSchema } from "@/lib/validators/employers";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/employers/me — get current employer's profile
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  return NextResponse.json({ employer });
}

// PATCH /api/employers/me — update current employer's profile
async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId });
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const body = await validateBody(req, employerUpdateSchema);

  const allowed = [
    "companyName", "companyEmail", "phone", "designation",
    "address", "website", "industry", "companySize",
    "description", "foundedYear", "socialLinks",
    "hiringPreferences", "notificationPrefs",
  ] as const;

  const updateData: Record<string, unknown> = {};
  for (const f of allowed) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }

  // Use updateOne to avoid full Mongoose validation on PII-encrypted fields
  await Employer.updateOne({ _id: employer._id }, { $set: updateData });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.update_profile",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { after: updateData },
    req,
  });

  // Re-fetch to return updated document (with decrypted fields via post-find hook)
  const updated = await Employer.findOne({ userId: ctx.userId }).lean();
  return NextResponse.json({ employer: updated });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
