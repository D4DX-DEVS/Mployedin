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
import logger from "@/lib/logger";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * Role changes must also create the role's profile document — job posting,
 * employer settings, and drafts all 404/403 when Employer/JobSeeker is missing
 * (admin-converted employers previously couldn't post jobs at all).
 */
async function ensureRoleProfile(user: { _id: unknown; name?: string; email?: string }, role: string): Promise<void> {
  if (role === "employer") {
    const { Employer } = await import("@/models/Employer");
    const exists = await Employer.exists({ userId: user._id });
    if (!exists) {
      await Employer.create({
        userId: user._id,
        companyName: user.name || "My Company",
        companyEmail: user.email,
      });
    }
  } else if (role === "job_seeker") {
    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const exists = await JobSeeker.exists({ userId: user._id });
    if (!exists) {
      await JobSeeker.create({ userId: user._id, fullName: user.name ?? "", isOnboarded: false });
    }
  } else if (role === "agent") {
    const exists = await Agent.exists({ userId: user._id });
    if (!exists) await Agent.create({ userId: user._id, commissionRate: 0 });
  } else if (role === "super_agent") {
    const exists = await SuperAgent.exists({ userId: user._id });
    if (!exists) await SuperAgent.create({ userId: user._id, overrideRate: 0 });
  }
}

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
  if (role === "unknown") {
    // Legacy/malformed accounts whose role isn't one of the known values —
    // surfaced on the dashboard's "Users by Role" but otherwise unreachable.
    query.role = { $nin: ["admin", "super_agent", "agent", "employer", "job_seeker"] };
  } else if (role && isValidRole(role)) query.role = role;
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
    if (action === "setRole" && !role) {
      return NextResponse.json({ error: "role required for setRole." }, { status: 400 });
    }
    if (!["setRole", "activate", "deactivate", "delete"].includes(action)) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const results: Array<{ userId: string; status: "updated" | "skipped" | "error"; reason?: string }> = [];

    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        results.push({ userId: id, status: "skipped", reason: "Invalid ID" });
        continue;
      }
      if (id === ctx.userId && (action === "deactivate" || action === "delete")) {
        results.push({ userId: id, status: "skipped", reason: "Cannot act on your own account" });
        continue;
      }
      try {
        let modified = false;
        switch (action) {
          case "setRole": {
            modified = (await User.updateOne({ _id: id }, { $set: { role } })).modifiedCount > 0;
            // Idempotent — also heals accounts converted before this fix existed.
            const u = await User.findById(id).select("name email").lean();
            if (u && role) await ensureRoleProfile(u, role);
            break;
          }
          case "activate":
            modified = (await User.updateOne({ _id: id }, { $set: { isActive: true } })).modifiedCount > 0;
            break;
          case "deactivate":
            modified = (await User.updateOne({ _id: id }, { $set: { isActive: false } })).modifiedCount > 0;
            break;
          case "delete":
            modified = (await User.deleteOne({ _id: id })).deletedCount > 0;
            break;
        }
        if (modified) {
          results.push({ userId: id, status: "updated" });
        } else {
          results.push({ userId: id, status: "skipped", reason: "Not found or already in that state" });
        }
      } catch {
        results.push({ userId: id, status: "error", reason: "Unexpected error" });
      }
    }

    const affected = results.filter((r) => r.status === "updated").length;

    await logActivity({
      ...actorFromCtx(ctx),
      action: `user.bulk_${action}`,
      resource: "users",
      meta: { ids, action, role, affected, skipped: results.length - affected },
      req,
    });

    return NextResponse.json({ success: true, affected, total: ids.length, results });
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
    // Custom mode with no grants would deny every resource — lock the user out.
    if (
      permissionMode === "custom" &&
      (!customPermissions || Object.keys(customPermissions as Record<string, unknown>).length === 0)
    ) {
      return NextResponse.json(
        { error: "Custom permission mode requires at least one permission grant." },
        { status: 400 }
      );
    }
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
    { returnDocument: "after" }
  ).select("-passwordHash").lean();

  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (role) {
    await ensureRoleProfile(updated as { _id: unknown; name?: string; email?: string }, role as string);
  }

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

    if (role === "employer" || role === "job_seeker") {
      await ensureRoleProfile(user, role);
    }
  } catch (profileErr) {
    // If profile creation fails, clean up the user document
    logger.error({ err: profileErr }, "[admin/users] Profile creation failed");
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

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "users", action: "update" });
export const POST = withAuth(postHandler, { resource: "users", action: "create" });
export const DELETE = withAuth(deleteHandler, { resource: "users", action: "delete" });
