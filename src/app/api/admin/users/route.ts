import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import type { UserRole } from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import mongoose from "mongoose";
import { escapeRegex, isValidRole } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { adminUserCreateSchema, adminUserPatchSchema, adminUserDeleteSchema } from "@/lib/validators/admin";

import bcrypt from "bcryptjs";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/admin/users — paginated user list (admin only)
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const role = searchParams.get("role") ?? "";
  const search = searchParams.get("search") ?? "";
  const isActive = searchParams.get("isActive") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (role && isValidRole(role)) query.role = role;
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
  const body = await validateBody(req, adminUserPatchSchema) as Record<string, unknown>;

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

    await logActivity({
      ...actorFromCtx(ctx),
      action: `user.bulk_${action}`,
      resource: "users",
      meta: { ids, action, role },
      req,
    });

    return NextResponse.json({ success: true, affected });
  }

  // ── Single-user mode (original)
  const { userId, role, isActive, name, email, permissionMode, customPermissions } = body;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (role) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (name) updateData.name = name;
  if (email) updateData.email = email;

  // Permission updates
  if (permissionMode !== undefined) {
    updateData.permissionMode = permissionMode;
    if (permissionMode === "custom" && customPermissions) {
      updateData.customPermissions = customPermissions;
    } else if (permissionMode === "role_default") {
      updateData.customPermissions = undefined;
    }
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true }
  ).select("-passwordHash").lean();

  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "user.update",
    resource: "users",
    resourceId: String(userId),
    changes: { after: updateData },
    req,
  });

  return NextResponse.json({ user: updated });
}

// POST /api/admin/users — create a new user (admin only)
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const body = await validateBody(req, adminUserCreateSchema);
  const {
    name, email, password, role, locale,
    // Permission fields
    permissionMode, customPermissions,
    // Agent/SuperAgent profile fields
    superAgentId, commissionRate, overrideRate,
    assignedCityIds, assignedStateIds, agentIds,
  } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: "name, email, password, and role are required" }, { status: 400 });
  }

  if (!isValidRole(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Build user document
  const userData: Record<string, unknown> = {
    name,
    email,
    passwordHash,
    role,
    locale: locale ?? "en",
    isActive: true,
  };

  // Custom permissions
  if (permissionMode === "custom" && customPermissions) {
    userData.permissionMode = "custom";
    userData.customPermissions = customPermissions;
  }

  const user = await User.create(userData);

  // Create profile document for agent/super_agent roles
  try {
    if (role === "agent") {
      // If commissionRate not explicitly set and agent belongs to a SA, use SA's default
      let resolvedCommission = commissionRate ?? 0;
      if (resolvedCommission === 0 && superAgentId) {
        const saDoc = await SuperAgent.findById(superAgentId).select("defaultAgentCommissionRate").lean();
        if (saDoc?.defaultAgentCommissionRate) {
          resolvedCommission = saDoc.defaultAgentCommissionRate;
        }
      }

      await Agent.create({
        userId: user._id,
        superAgentId: superAgentId || undefined,
        commissionRate: resolvedCommission,
        assignedCityIds: assignedCityIds ?? [],
        assignedStateIds: assignedStateIds ?? [],
      });

      // If a superAgentId is specified, add this agent to the super agent's agentIds
      if (superAgentId) {
        await SuperAgent.findByIdAndUpdate(superAgentId, {
          $addToSet: { agentIds: (await Agent.findOne({ userId: user._id }))._id },
        });
      }
    }

    if (role === "super_agent") {
      await SuperAgent.create({
        userId: user._id,
        overrideRate: overrideRate ?? 0,
        assignedCityIds: assignedCityIds ?? [],
        assignedStateIds: assignedStateIds ?? [],
        agentIds: agentIds ?? [],
      });
    }
  } catch (profileErr) {
    // If profile creation fails, clean up the user document
    console.error("[admin/users] Profile creation failed:", profileErr);
    await User.findByIdAndDelete(user._id);
    return NextResponse.json(
      { error: "Failed to create user profile" },
      { status: 500 }
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "user.create",
    resource: "users",
    resourceId: String(user._id),
    meta: { role },
    req,
  });

  return NextResponse.json({ user: { ...user.toObject(), passwordHash: undefined } }, { status: 201 });
}

// DELETE /api/admin/users — deactivate or permanently delete users
async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();
  const body = await validateBody(req, adminUserDeleteSchema);
  const { userId, permanent } = body as { userId: string; permanent?: boolean };

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (permanent) {
    // Clean up dependents and role profile before deleting the user.
    const {
      cascadeDeleteEmployer,
      cascadeDeleteJobSeeker,
      cascadeDeleteAgentUser,
    } = await import("@/lib/db/cascade");
    let cascade: Record<string, number> = {};

    if (user.role === "agent") {
      cascade = await cascadeDeleteAgentUser(user._id, "agent");
      await Agent.findOneAndDelete({ userId: user._id });
    } else if (user.role === "super_agent") {
      cascade = await cascadeDeleteAgentUser(user._id, "super_agent");
      await SuperAgent.findOneAndDelete({ userId: user._id });
    } else if (user.role === "employer") {
      cascade = await cascadeDeleteEmployer(user._id);
      const { Employer } = await import("@/models/Employer");
      await Employer.deleteOne({ userId: user._id });
    } else if (user.role === "job_seeker") {
      cascade = await cascadeDeleteJobSeeker(user._id);
      const { JobSeeker } = await import("@/models/JobSeeker");
      await JobSeeker.deleteOne({ userId: user._id });
    }

    await user.deleteOne();
    await logActivity({
      ...actorFromCtx(ctx),
      action: "user.delete",
      resource: "users",
      resourceId: String(userId),
      meta: { cascade },
      req,
    });
    return NextResponse.json({ message: "User permanently deleted", cascade });
  }

  user.isActive = false;
  await user.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "user.deactivate",
    resource: "users",
    resourceId: String(userId),
    req,
  });

  return NextResponse.json({ message: "User deactivated" });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
