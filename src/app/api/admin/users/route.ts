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
import { deactivateEmployerAccount, reactivateEmployerAccount } from "@/lib/employers/accountStatus";
import { notifyRoleChanged } from "@/lib/notifications/trigger";

import bcrypt from "bcryptjs";
import logger from "@/lib/logger";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * A role change has to move the account's profile document too — job posting,
 * employer settings and drafts all 404/403 when Employer/JobSeeker is missing
 * (admin-converted employers once couldn't post jobs at all). This is the one
 * place that does it, for both the single-user update and bulk `setRole`.
 *
 * The outgoing profile is ARCHIVED, never deleted. Deleting it was destructive
 * in both directions:
 *   - seeker → anything binned the CV, skills and onboarding state for good.
 *     Converting back handed the person a blank profile, and their existing
 *     applications still pointed at a JobSeeker id that no longer existed.
 *   - employer → anything deleted the Employer but left that company's jobs
 *     `status: "active"` with a dangling `employerId`: still on the public
 *     board, still taking applications, with no owner able to take them down.
 *
 * So outgoing profiles get a `roleArchivedAt` stamp, and an outgoing employer
 * additionally runs through `deactivateEmployerAccount`, which pauses exactly
 * their live jobs with the restorable `employer_deactivated` reason. Converting
 * back clears the stamp and resumes exactly those jobs.
 */
async function applyRoleProfileChange(
  user: { _id: unknown; name?: string; email?: string },
  role: string,
  oldRole?: string,
  /**
   * Only `role_conversion` profiles carry the job-publishing gate. An admin
   * creating an employer from scratch fills the company details in the same
   * form, so gating those would block a flow that is already complete.
   */
  createdVia: "role_conversion" | "admin" = "role_conversion",
): Promise<void> {
  const userId = user._id;

  if (oldRole && oldRole !== role) {
    const archivedAt = new Date();
    if (oldRole === "employer") {
      // Pauses live jobs and mirrors isActive — must run before the stamp so a
      // failure here leaves the profile visibly un-archived rather than
      // silently archived with its jobs still public.
      await deactivateEmployerAccount(String(userId));
      const { Employer } = await import("@/models/Employer");
      await Employer.updateOne({ userId }, { $set: { roleArchivedAt: archivedAt } });
    } else if (oldRole === "job_seeker") {
      const JobSeeker = (await import("@/models/JobSeeker")).default;
      await JobSeeker.updateOne({ userId }, { $set: { roleArchivedAt: archivedAt } });
    } else if (oldRole === "agent") {
      await Agent.updateOne({ userId }, { $set: { roleArchivedAt: archivedAt } });
    } else if (oldRole === "super_agent") {
      await SuperAgent.updateOne({ userId }, { $set: { roleArchivedAt: archivedAt } });
    }
  }

  if (role === "employer") {
    const { Employer } = await import("@/models/Employer");
    const existing = await Employer.exists({ userId });
    if (existing) {
      // Returning to a profile we archived earlier: un-archive and resume only
      // the jobs that deactivation paused.
      await Employer.updateOne({ userId }, { $set: { roleArchivedAt: null } });
      await reactivateEmployerAccount(String(userId));
    } else {
      await Employer.create({
        userId,
        // `companyName` is `required`, so this seeds from the account name — but
        // `createdVia: "role_conversion"` keeps the profile behind the
        // publishing gate until the employer confirms real company details, so
        // a personal name never reaches the public job board.
        companyName: user.name || "My Company",
        companyEmail: user.email,
        createdVia,
        profileConfirmedAt: null,
      });
    }
  } else if (role === "job_seeker") {
    const JobSeeker = (await import("@/models/JobSeeker")).default;
    const existing = await JobSeeker.exists({ userId });
    if (existing) {
      await JobSeeker.updateOne({ userId }, { $set: { roleArchivedAt: null } });
    } else {
      await JobSeeker.create({ userId, fullName: user.name ?? "", isOnboarded: false });
    }
  } else if (role === "agent") {
    const existing = await Agent.exists({ userId });
    if (existing) await Agent.updateOne({ userId }, { $set: { roleArchivedAt: null } });
    else await Agent.create({ userId, commissionRate: 0 });
  } else if (role === "super_agent") {
    const existing = await SuperAgent.exists({ userId });
    if (existing) await SuperAgent.updateOne({ userId }, { $set: { roleArchivedAt: null } });
    else await SuperAgent.create({ userId, overrideRate: 0 });
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

/**
 * Employers own live jobs. Flipping `User.isActive` alone left a deactivated
 * company's postings public and still accepting applications — mirror the
 * account state onto the Employer profile and pause / resume its jobs.
 */
async function syncEmployerAccountStatus(userId: string, isActive: boolean): Promise<void> {
  const target = await User.findById(userId).select("role").lean<{ role?: string } | null>();
  if (target?.role !== "employer") return;
  if (isActive) await reactivateEmployerAccount(userId);
  else await deactivateEmployerAccount(userId);
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
    // Recorded per user so the audit row can say what each account was before,
    // not just which role they all ended up on.
    const roleChanges: Array<{ userId: string; from: string; to: string }> = [];

    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        results.push({ userId: id, status: "skipped", reason: "Invalid ID" });
        continue;
      }
      if (id === ctx.userId && (action === "deactivate" || action === "delete" || action === "setRole")) {
        results.push({ userId: id, status: "skipped", reason: "Cannot act on your own account" });
        continue;
      }
      try {
        let modified = false;
        switch (action) {
          case "setRole": {
            // Prevent removing the last admin
            const targetUser = await User.findById(id).select("role").lean();
            if (targetUser?.role === "admin" && role !== "admin") {
              const adminCount = await User.countDocuments({ role: "admin", isActive: true });
              if (adminCount <= 1) {
                results.push({ userId: id, status: "skipped", reason: "Cannot demote the last active admin" });
                break;
              }
            }
            // Reset permissions with the role, exactly as the single-user path
            // does. Without this a user on `custom` permissions kept every
            // grant from their previous role after a bulk conversion.
            modified = (await User.updateOne(
              { _id: id },
              { $set: { role, permissionMode: "role_default" }, $unset: { customPermissions: "" } },
            )).modifiedCount > 0;
            // Idempotent — also heals accounts converted before this fix existed.
            const u = await User.findById(id).select("name email role").lean();
            if (u && role) await applyRoleProfileChange(u, role, targetUser?.role);
            if (role && targetUser?.role && targetUser.role !== role) {
              roleChanges.push({ userId: id, from: String(targetUser.role), to: role });
              await notifyRoleChanged(id, String(targetUser.role), role);
            }
            break;
          }
          case "activate":
            modified = (await User.updateOne({ _id: id }, { $set: { isActive: true } })).modifiedCount > 0;
            if (modified) await syncEmployerAccountStatus(id, true);
            break;
          case "deactivate":
            modified = (await User.updateOne({ _id: id }, { $set: { isActive: false } })).modifiedCount > 0;
            if (modified) await syncEmployerAccountStatus(id, false);
            break;
          case "delete": {
            const targetUser = await User.findById(id);
            if (targetUser) {
              const {
                cascadeDeleteEmployer,
                cascadeDeleteJobSeeker,
                cascadeDeleteAgentUser,
              } = await import("@/lib/db/cascade");
              if (targetUser.role === "agent") {
                await cascadeDeleteAgentUser(targetUser._id, "agent");
                await Agent.findOneAndDelete({ userId: targetUser._id });
              } else if (targetUser.role === "super_agent") {
                await cascadeDeleteAgentUser(targetUser._id, "super_agent");
                await SuperAgent.findOneAndDelete({ userId: targetUser._id });
              } else if (targetUser.role === "employer") {
                await cascadeDeleteEmployer(targetUser._id);
                const { Employer } = await import("@/models/Employer");
                await Employer.deleteOne({ userId: targetUser._id });
              } else if (targetUser.role === "job_seeker") {
                await cascadeDeleteJobSeeker(targetUser._id);
                const { JobSeeker } = await import("@/models/JobSeeker");
                await JobSeeker.deleteOne({ userId: targetUser._id });
              }
              modified = (await User.deleteOne({ _id: id })).deletedCount > 0;
            }
            break;
          }
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
      ...(roleChanges.length ? { changes: { before: { roles: roleChanges.map((c) => c.from) }, after: { roles: roleChanges.map((c) => c.to) } } } : {}),
      req,
    });

    return NextResponse.json({ success: true, affected, total: ids.length, results });
  }

  // ── Single-user mode (original)
  const { userId, role, isActive, name, email, permissionMode, customPermissions } = body;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  /* The bulk path has always refused these against the caller's own account;
     the single-user path did not, so the row controls on the users table could
     sign the admin out of their own session (isActive: false) or strip their
     own admin role, with no way back through the UI. */
  if (String(userId) === String(ctx.userId)) {
    if (isActive === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
    if (role && role !== ctx.role) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    }
  }

  const updateData: Record<string, unknown> = {};
  /* `$set: { customPermissions: undefined }` is a no-op — Mongoose drops
     undefined values from the update, so a map built for the OLD role survived
     both a role change and a switch back to role defaults. It stayed inert
     (canAccess only reads it in custom mode) but the editor prefilled from it
     the next time custom was switched on. Unset the field for real. */
  const unsetData: Record<string, unknown> = {};
  if (role) {
    updateData.role = role;
    updateData.permissionMode = "role_default";
    unsetData.customPermissions = "";
  }
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
      delete unsetData.customPermissions;
    } else if (permissionMode === "role_default") {
      delete updateData.customPermissions;
      unsetData.customPermissions = "";
    }
  }

  /* An address already on another account used to reach Mongo and come back as
     an E11000 the UI could only show as an unexpected error. The admin editing
     a user sees the conflict named instead. */
  if (email) {
    const clash = await User.findOne({ email, _id: { $ne: userId } }).select("_id").lean();
    if (clash) return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const oldUser = await User.findById(userId)
    .select("role isActive name email permissionMode")
    .lean<Record<string, unknown> | null>();
  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: updateData,
      ...(Object.keys(unsetData).length ? { $unset: unsetData } : {}),
    },
    { returnDocument: "after" }
  ).select("-passwordHash").lean();

  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (typeof isActive === "boolean" && (updated as { role?: string }).role === "employer") {
    if (isActive) await reactivateEmployerAccount(userId as string);
    else await deactivateEmployerAccount(userId as string);
  }

  if (role) {
    await applyRoleProfileChange(
      updated as { _id: unknown; name?: string; email?: string },
      role as string,
      oldUser?.role as string | undefined,
    );
  }

  // `after` on its own made the audit trail unreadable: a row said
  // `role: "employer"` with no way to tell what the role had been, or whether
  // the field changed at all. Snapshot the same keys from the pre-update doc.
  const before: Record<string, unknown> = {};
  for (const key of [...Object.keys(updateData), ...Object.keys(unsetData)]) {
    before[key] = oldUser?.[key] ?? null;
  }

  await logActivity({
    ...actorFromCtx(ctx),
    // A role conversion rewrites what the account can do and moves its profile
    // document; it deserves its own action rather than hiding inside the
    // catch-all "user.update" alongside a name edit.
    action: role ? "user.role_change" : "user.update",
    resource: "users",
    resourceId: String(userId),
    changes: { before, after: updateData },
    meta: {
      targetName: (oldUser?.name as string | undefined) ?? (updated as { name?: string }).name,
      targetEmail: (oldUser?.email as string | undefined) ?? (updated as { email?: string }).email,
      ...(role ? { fromRole: oldUser?.role, toRole: role } : {}),
    },
    req,
  });

  if (role && oldUser?.role && oldUser.role !== role) {
    await notifyRoleChanged(String(userId), String(oldUser.role), String(role));
  }

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
      await applyRoleProfileChange(user, role, undefined, "admin");
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
  if (String(userId) === String(ctx.userId)) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

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

  // When deactivating an employer, close their active jobs
  if (user.role === "employer") {
    const { Employer } = await import("@/models/Employer");
    const employer = await Employer.findOne({ userId: user._id }).select("_id").lean();
    if (employer) {
      const Job = (await import("@/models/Job")).default;
      await Job.updateMany({ employerId: employer._id, status: "active" }, { $set: { status: "closed" } });
    }
  }

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
