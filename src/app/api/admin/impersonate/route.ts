import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import ImpersonationSession from "@/models/ImpersonationSession";
import { validateBody } from "@/lib/validators";
import { impersonateSchema } from "@/lib/validators/admin";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { checkRateLimit } from "@/lib/security/rateLimit";

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/admin/impersonate
 * Body: { userId: string } — Start impersonation; creates a server-side session
 * Body: { exit: true }    — End impersonation; deletes all sessions for this admin
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  // Rate limit: 10 impersonations per hour per admin
  const { allowed } = await checkRateLimit(`impersonate:${ctx.userId}`, { limit: 10, windowSec: 3600, prefix: "impersonate", failClosed: true });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await connectDB();
  const body = await validateBody(req, impersonateSchema);

  if (body.exit) {
    // Delete all active impersonation sessions for this admin
    await ImpersonationSession.deleteMany({ adminId: ctx.userId });

    await logActivity({
      ...actorFromCtx(ctx),
      action: "impersonation.exit",
      resource: "users",
      resourceId: ctx.userId,
      req,
    });
    return NextResponse.json({ success: true, message: "Impersonation ended" });
  }

  const { userId } = body as { userId: string };
  if (!isValidObjectId(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const target = await User.findById(userId).select("name email role isActive").lean();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!target.isActive) return NextResponse.json({ error: "Cannot impersonate inactive user" }, { status: 400 });

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // Replace any existing session for this admin (one active impersonation at a time)
  await ImpersonationSession.findOneAndUpdate(
    { adminId: ctx.userId },
    {
      adminId: ctx.userId,
      targetId: userId,
      targetEmail: target.email,
      targetRole: target.role,
      expiresAt,
    },
    { upsert: true, new: true }
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "impersonation.start",
    resource: "users",
    resourceId: userId,
    meta: { targetEmail: target.email, targetRole: target.role },
    req,
  });

  return NextResponse.json({
    success: true,
    target: {
      id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
    expiresAt: expiresAt.toISOString(),
  });
}, { resource: "users", action: "impersonate" });

/**
 * GET /api/admin/impersonate
 * Returns the current admin's active impersonation session (if any).
 * Used by the UI on mount to restore impersonation state after a page refresh.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  await connectDB();

  const session = await ImpersonationSession.findOne({
    adminId: ctx.userId,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) {
    return NextResponse.json({ active: false });
  }

  const target = await User.findById(session.targetId)
    .select("name email role isActive")
    .lean();

  // Session exists but user was deactivated — clean it up
  if (!target || !target.isActive) {
    await ImpersonationSession.deleteOne({ _id: session._id });
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    target: {
      id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
    expiresAt: session.expiresAt.toISOString(),
  });
}, { resource: "users", action: "impersonate" });
