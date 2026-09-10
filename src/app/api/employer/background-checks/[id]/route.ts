import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import BackgroundCheck from "@/models/BackgroundCheck";
import { validateBody } from "@/lib/validators";
import { backgroundCheckUpdateSchema } from "@/lib/validators/backgroundChecks";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
  /** Present when the caller is a colleague borrowing the owner's workspace. */
  member?: AuthContext["member"];
}

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

  // ctx.userId is the company owner even when a colleague is calling, so the
  // real person is ctx.member.actorId when a member context is present.
  const actorId = ctx.member?.actorId ?? ctx.userId;
  const canManage = !ctx.member || ctx.member.permissions.canManageTeam === true;

  if (body.assignedTo !== undefined) {
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the account owner or a team manager can assign a check." },
        { status: 403 }
      );
    }
    check.assignedTo = (body.assignedTo || undefined) as typeof check.assignedTo;
    check.assignedBy = actorId as unknown as typeof check.assignedBy;
    check.assignedAt = new Date();
  }

  if (body.verify === true) {
    // The verdict belongs to whoever holds the check. A manager can always
    // record one, and an unassigned check is open to anyone who got this far.
    const assigned = check.assignedTo ? String(check.assignedTo) : null;
    if (assigned !== null && assigned !== String(actorId) && !canManage) {
      return NextResponse.json(
        { error: "This check is assigned to somebody else." },
        { status: 403 }
      );
    }
    check.status = "completed";
    if (!check.completedAt) check.completedAt = new Date();
    check.verifiedBy = actorId as unknown as typeof check.verifiedBy;
    check.verifiedAt = new Date();
  }

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
    action:
      body.verify === true
        ? "background_check.verify"
        : body.assignedTo !== undefined
          ? "background_check.assign"
          : "background_check.update",
    resource: "applications",
    resourceId: String(check._id),
    req,
  }).catch(() => { /* non-blocking */ });

  // Re-fetch with population so the client keeps candidate/job context after update.
  const populated = await BackgroundCheck.findById(check._id)
    .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name" } })
    .populate({ path: "jobId", select: "title" })
    .populate({ path: "assignedTo", select: "name email" })
    .populate({ path: "verifiedBy", select: "name email" })
    .lean();

  return NextResponse.json({ check: populated ?? check });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "applications", action: "update" });
