import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import BackgroundCheck from "@/models/BackgroundCheck";
import { validateBody } from "@/lib/validators";
import { backgroundCheckUpdateSchema } from "@/lib/validators/backgroundChecks";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/employer/background-checks/[id] (FG-7) — single check detail.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const check = await BackgroundCheck.findById(params?.id)
    .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name" } })
    .populate({ path: "jobId", select: "title" })
    .lean();
  if (!check) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (String((check as { employerId: unknown }).employerId) !== String((emp as { _id: unknown })._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ check });
}

/**
 * PATCH /api/employer/background-checks/[id] (FG-7)
 * Update overall status/outcome, background results, or a single reference's
 * response (status + feedback). Auto-stamps completedAt when marked completed.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const check = await BackgroundCheck.findById(params?.id);
  if (!check) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (String(check.employerId) !== String((emp as { _id: unknown })._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, backgroundCheckUpdateSchema);

  if (body.status) {
    check.status = body.status;
    if (body.status === "completed" && !check.completedAt) check.completedAt = new Date();
  }
  if (body.outcome) check.outcome = body.outcome;
  if (body.backgroundResults !== undefined) check.backgroundResults = body.backgroundResults;
  if (body.backgroundNotes !== undefined) check.backgroundNotes = body.backgroundNotes;

  if (body.reference) {
    const ref = check.references[body.reference.index];
    if (!ref) return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    if (body.reference.status) {
      ref.status = body.reference.status;
      if (body.reference.status === "responded") ref.respondedAt = new Date();
    }
    if (body.reference.feedback !== undefined) ref.feedback = body.reference.feedback;
    check.markModified("references");
  }

  await check.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "background_check.update",
    resource: "applications",
    resourceId: String(check._id),
    req,
  }).catch(() => { /* non-blocking */ });

  // Re-fetch with population so the client keeps candidate/job context after update.
  const populated = await BackgroundCheck.findById(check._id)
    .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name" } })
    .populate({ path: "jobId", select: "title" })
    .lean();

  return NextResponse.json({ check: populated ?? check });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "applications", action: "update" });
