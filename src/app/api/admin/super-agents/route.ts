import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import "@/models/City";
import "@/models/State";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";
import { escapeRegex } from "@/lib/security/sanitize";
import bcrypt from "bcryptjs";
import { validateBody } from "@/lib/validators";
import { superAgentCreateSchema, superAgentUpdateSchema } from "@/lib/validators/admin";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/admin/super-agents — list super agents with profile data
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const search = searchParams.get("search") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { role: "super_agent" };
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

  // Fetch super agent profiles
  const userIds = users.map((u) => u._id);
  const saProfiles = await SuperAgent.find({ userId: { $in: userIds } })
    .populate("assignedCityIds", "name nameAr")
    .populate("assignedStateIds", "name nameAr")
    .populate("agentIds", "userId")
    .lean();

  const profileMap = new Map(
    saProfiles.map((p) => [p.userId.toString(), p])
  );

  // Fetch agent user names for agentIds display
  const allAgentDocIds = saProfiles.flatMap((p) =>
    (p.agentIds ?? []).map((a: { userId?: unknown }) => a?.userId).filter(Boolean)
  );
  const agentUsers = allAgentDocIds.length > 0
    ? await User.find({ _id: { $in: allAgentDocIds } }).select("name").lean()
    : [];
  const agentNameMap = new Map(agentUsers.map((u) => [u._id.toString(), u.name]));

  const enriched = users.map((user) => {
    const profile = profileMap.get(user._id.toString());
    const agents = (profile?.agentIds ?? []).map((a: { _id: unknown; userId?: unknown }) => {
      const agentUserId = a?.userId?.toString();
      return {
        _id: a._id,
        name: agentUserId ? agentNameMap.get(agentUserId) ?? "Unknown" : "Unknown",
      };
    });

    return {
      ...user,
      superAgentProfile: profile
        ? {
            _id: profile._id,
            overrideCommissionRate: profile.overrideRate ?? 0,
            assignedCityIds: profile.assignedCityIds,
            assignedStateIds: profile.assignedStateIds,
            agents,
            agentCount: agents.length,
          }
        : null,
    };
  });

  return NextResponse.json({
    superAgents: enriched,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/admin/super-agents — create a super agent (user + profile)
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const body = await validateBody(req, superAgentCreateSchema);
  const { name, email, password, overrideCommissionRate, assignedCityIds, assignedStateIds, agentIds } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: "super_agent",
    isActive: true,
  });

  try {
    const saDoc = await SuperAgent.create({
      userId: user._id,
      overrideRate: overrideCommissionRate ?? 0,
      assignedCityIds: assignedCityIds ?? [],
      assignedStateIds: assignedStateIds ?? [],
      agentIds: agentIds ?? [],
    });

    // Link agents back to this super agent
    if (agentIds?.length) {
      await Agent.updateMany(
        { _id: { $in: agentIds } },
        { $set: { superAgentId: saDoc._id } }
      );
    }
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    console.error("[admin/super-agents] Profile creation failed:", err);
    return NextResponse.json({ error: "Failed to create super agent profile" }, { status: 500 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "super_agent.create",
    resource: "super_agents",
    resourceId: String(user._id),
    req,
  });

  return NextResponse.json({ success: true, userId: user._id }, { status: 201 });
}

/**
 * PATCH /api/admin/super-agents — update super agent user + profile
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const body = await validateBody(req, superAgentUpdateSchema);
  const { userId, name, email, isActive, overrideCommissionRate, assignedCityIds, assignedStateIds, agentIds } = body;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // Update user fields
  const userUpdate: Record<string, unknown> = {};
  if (name !== undefined) userUpdate.name = name;
  if (email !== undefined) userUpdate.email = email;
  if (isActive !== undefined) userUpdate.isActive = isActive;

  if (Object.keys(userUpdate).length > 0) {
    await User.findByIdAndUpdate(userId, { $set: userUpdate });
  }

  // Update or create super agent profile
  const profileUpdate: Record<string, unknown> = {};
  if (overrideCommissionRate !== undefined) profileUpdate.overrideRate = overrideCommissionRate;
  if (assignedCityIds !== undefined) profileUpdate.assignedCityIds = assignedCityIds;
  if (assignedStateIds !== undefined) profileUpdate.assignedStateIds = assignedStateIds;
  if (agentIds !== undefined) profileUpdate.agentIds = agentIds;

  // Detect region overlap with other super agents
  let regionConflicts: { superAgentName: string; overlappingCities: number; overlappingStates: number }[] = [];
  if (assignedCityIds?.length || assignedStateIds?.length) {
    const otherSAs = await SuperAgent.find({ userId: { $ne: userId } })
      .select("userId assignedCityIds assignedStateIds")
      .lean();
    const saUserIds = otherSAs.map((sa) => sa.userId);
    const saNameDocs = saUserIds.length > 0
      ? await User.find({ _id: { $in: saUserIds } }).select("name").lean()
      : [];
    const nameMap = new Map(saNameDocs.map((u) => [u._id.toString(), u.name]));

    const citySet = new Set((assignedCityIds ?? []).map(String));
    const stateSet = new Set((assignedStateIds ?? []).map(String));

    for (const other of otherSAs) {
      const overlapCities = (other.assignedCityIds ?? []).filter((id: unknown) => citySet.has(String(id))).length;
      const overlapStates = (other.assignedStateIds ?? []).filter((id: unknown) => stateSet.has(String(id))).length;
      if (overlapCities > 0 || overlapStates > 0) {
        regionConflicts.push({
          superAgentName: nameMap.get(other.userId.toString()) ?? "Unknown",
          overlappingCities: overlapCities,
          overlappingStates: overlapStates,
        });
      }
    }
  }

  if (Object.keys(profileUpdate).length > 0) {
    const saDoc = await SuperAgent.findOneAndUpdate(
      { userId },
      { $set: profileUpdate },
      { upsert: true, new: true }
    );

    // Sync agent references: set superAgentId on assigned agents, clear on removed ones
    if (agentIds !== undefined) {
      await Agent.updateMany(
        { _id: { $in: agentIds } },
        { $set: { superAgentId: saDoc._id } }
      );
      await Agent.updateMany(
        { superAgentId: saDoc._id, _id: { $nin: agentIds } },
        { $unset: { superAgentId: "" } }
      );
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "super_agent.update",
    resource: "super_agents",
    resourceId: String(userId),
    changes: { after: { ...userUpdate, ...profileUpdate } },
    req,
  });

  return NextResponse.json({
    success: true,
    ...(regionConflicts.length > 0 ? {
      warnings: [{
        type: "region_overlap",
        message: `Region overlap detected with ${regionConflicts.length} other super agent(s).`,
        conflicts: regionConflicts,
      }],
    } : {}),
  });
}

export const GET = withAuth(getHandler as unknown as Parameters<typeof withAuth>[0]);
export const POST = withAuth(postHandler as unknown as Parameters<typeof withAuth>[0]);
export const PATCH = withAuth(patchHandler as unknown as Parameters<typeof withAuth>[0]);
