import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";
import { validateBody } from "@/lib/validators";
import { impersonateSchema } from "@/lib/validators/admin";

/**
 * POST /api/admin/impersonate
 * Body: { userId: string } — Start impersonation
 * Body: { exit: true }    — End impersonation
 *
 * This route logs the action and returns the target user profile.
 * The client stores the impersonation state in a cookie/session
 * using the returned impersonationToken (a signed data object).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const body = await validateBody(req, impersonateSchema);

  if (body.exit) {
    await AuditLog.create({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "update",
      resource: "users",
      resourceId: ctx.userId,
      metadata: { action: "impersonation_exit" },
      ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
    });
    return NextResponse.json({ success: true, message: "Impersonation ended" });
  }

  const { userId } = body as { userId: string };
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await User.findById(userId).select("name email role isActive").lean();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!target.isActive) return NextResponse.json({ error: "Cannot impersonate inactive user" }, { status: 400 });

  await AuditLog.create({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "impersonate",
    resource: "users",
    resourceId: userId,
    metadata: { targetEmail: target.email, targetRole: target.role },
    ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
  });

  return NextResponse.json({
    success: true,
    target: {
      id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
  });
}, { resource: "users", action: "impersonate" });
