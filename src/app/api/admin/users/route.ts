import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import type { UserRole } from "@/models/User";
import AuditLog from "@/models/AuditLog";
import mongoose from "mongoose";
import { escapeRegex, isValidRole } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/admin/users — paginated user list (admin only)
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));
  const role = searchParams.get("role") ?? "";
  const search = searchParams.get("search") ?? "";
  const isActive = searchParams.get("isActive") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (role) query.role = role;
  if (isActive !== "") query.isActive = isActive === "true";
  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { name: new RegExp(safe, "i") },
      { email: new RegExp(safe, "i") },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return NextResponse.json({
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// PATCH /api/admin/users — single update OR bulk action
async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const body = await req.json();

  // ── Bulk mode: { ids: string[], action: "setRole"|"activate"|"deactivate"|"delete", role? }
  if (Array.isArray(body.ids)) {
    const { ids, action, role } = body as { ids: string[]; action: string; role?: string };

    if (!ids.length || !action) {
      return NextResponse.json({ error: "ids and action required." }, { status: 400 });
    }

    const objectIds = ids
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    let affected = 0;

    switch (action) {
      case "setRole":
        if (!role) return NextResponse.json({ error: "role required for setRole." }, { status: 400 });
        { const r = await User.updateMany({ _id: { $in: objectIds } }, { $set: { role } }); affected = r.modifiedCount; }
        break;
      case "activate":
        { const r = await User.updateMany({ _id: { $in: objectIds } }, { $set: { isActive: true } }); affected = r.modifiedCount; }
        break;
      case "deactivate":
        { const r = await User.updateMany({ _id: { $in: objectIds } }, { $set: { isActive: false } }); affected = r.modifiedCount; }
        break;
      case "delete":
        { const r = await User.deleteMany({ _id: { $in: objectIds } }); affected = r.deletedCount; }
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    await AuditLog.create({
      actorId: ctx.userId,
      action: `bulk.${action}`,
      resource: "users",
      changes: { before: {}, after: { ids, action, role } },
      ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    return NextResponse.json({ success: true, affected });
  }

  // ── Single-user mode (original)
  const { userId, role, isActive } = body;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (role) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true }
  ).select("-passwordHash").lean();

  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Log the action
  await AuditLog.create({
    actorId: ctx.userId,
    action: "user.update",
    resource: "users",
    resourceId: userId,
    changes: { before: {}, after: updateData },
    ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
  });

  return NextResponse.json({ user: updated });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
