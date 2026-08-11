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
import { agentCreateSchema, agentUpdateSchema } from "@/lib/validators/admin";
import { isRegionSubset } from "@/lib/auth/agentRestrictions";
import type { RegionInfo } from "@/lib/auth/agentRestrictions";
import logger from "@/lib/logger";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * GET /api/admin/agents — list agents with profile data (region, super agent, etc.)
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const search = searchParams.get("search") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { role: "agent" };
  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { name: new RegExp(safe, "i") },
      { email: new RegExp(safe, "i") },
    ];
  }

  // Status filter — isActive is absent on legacy docs, so "active" means "not false"
  const statusParam = searchParams.get("status");
  if (statusParam === "active") query.isActive = { $ne: false };
  else if (statusParam === "inactive") query.isActive = false;

  const sortBy = searchParams.get("sortBy") === "name" ? "name" : "createdAt";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;

  const [users, total] = await Promise.all([
    User.find(query)
      .select("-passwordHash")
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  // Fetch agent profiles for these users
  const userIds = users.map((u) => u._id);
  const agentProfiles = await Agent.find({ userId: { $in: userIds } })
    .populate("assignedCityIds", "name nameAr")
    .populate("assignedStateIds", "name nameAr")
    .populate("superAgentId", "userId")
    .lean();

  const profileMap = new Map(
    agentProfiles.map((p) => [p.userId.toString(), p])
  );

  // Enrich super agent names + regions
  const superAgentDocIds = agentProfiles
    .filter((p) => p.superAgentId)
    .map((p) => {
      const sa = p.superAgentId as unknown as { _id: unknown; userId: unknown };
      return sa?._id;
    })
    .filter(Boolean);

  const superAgentUserIds = agentProfiles
    .filter((p) => p.superAgentId)
    .map((p) => {
      const sa = p.superAgentId as unknown as { userId: unknown };
      return sa?.userId;
    })
    .filter(Boolean);

  const [saUsers, saProfiles] = await Promise.all([
    superAgentUserIds.length > 0
      ? User.find({ _id: { $in: superAgentUserIds } }).select("name").lean()
      : [],
    superAgentDocIds.length > 0
      ? SuperAgent.find({ _id: { $in: superAgentDocIds } })
          .populate("assignedCityIds", "name nameAr")
          .populate("assignedStateIds", "name nameAr")
          .lean()
      : [],
  ]);
  const saNameMap = new Map(saUsers.map((u) => [u._id.toString(), u.name]));
  const saRegionMap = new Map(saProfiles.map((p) => [p._id.toString(), p]));

  // Backfill: agents with a super agent but no region get the SA's region written to DB
  const backfillOps = agentProfiles
    .filter((p) => {
      if (!p.superAgentId) return false;
      const hasCities = (p.assignedCityIds as unknown[])?.length > 0;
      const hasStates = (p.assignedStateIds as unknown[])?.length > 0;
      return !hasCities && !hasStates;
    })
    .map((p) => {
      const saDocId = (p.superAgentId as unknown as { _id: unknown })?._id?.toString();
      const saProfile = saDocId ? saRegionMap.get(saDocId) : null;
      if (!saProfile) return null;
      const extractIds = (arr: unknown[]) =>
        arr.map((item) => (typeof item === "object" && item && "_id" in item ? (item as { _id: unknown })._id : item));
      return {
        agentId: p._id,
        cityIds: extractIds(saProfile.assignedCityIds as unknown[] ?? []),
        stateIds: extractIds(saProfile.assignedStateIds as unknown[] ?? []),
      };
    })
    .filter(Boolean);

  if (backfillOps.length > 0) {
    await Promise.all(
      backfillOps.map((op) =>
        Agent.findByIdAndUpdate(op!.agentId, {
          $set: { assignedCityIds: op!.cityIds, assignedStateIds: op!.stateIds },
        })
      )
    );
  }

  const enriched = users.map((user) => {
    const profile = profileMap.get(user._id.toString());
    const saProfile = profile?.superAgentId as unknown as { _id: unknown; userId: unknown } | undefined;
    const saUserId = saProfile?.userId?.toString();
    const saDocId = saProfile?._id?.toString();
    const saRegion = saDocId ? saRegionMap.get(saDocId) : null;

    // Use agent's own region, or fall back to SA's region for display
    const agentCities = (profile?.assignedCityIds as unknown[])?.length > 0
      ? profile!.assignedCityIds
      : saRegion?.assignedCityIds ?? [];
    const agentStates = (profile?.assignedStateIds as unknown[])?.length > 0
      ? profile!.assignedStateIds
      : saRegion?.assignedStateIds ?? [];

    return {
      ...user,
      agentProfile: profile
        ? {
            _id: profile._id,
            superAgentId: saDocId ?? null,
            superAgentName: saUserId ? saNameMap.get(saUserId) : undefined,
            commissionRate: profile.commissionRate,
            assignedCityIds: agentCities,
            assignedStateIds: agentStates,
          }
        : null,
    };
  });

  return NextResponse.json({
    agents: enriched,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/admin/agents — create an agent (user + profile)
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const body = await validateBody(req, agentCreateSchema);
  const { name, email, password, superAgentId, commissionRate, assignedCityIds, assignedStateIds } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
  }

  // Validate agent regions are subset of super agent's regions (if assigning to a super agent)
  if (superAgentId && (assignedCityIds?.length || assignedStateIds?.length)) {
    const saDoc = await SuperAgent.findById(superAgentId)
      .select("assignedCityIds assignedStateIds")
      .lean();
    if (saDoc) {
      const saRegion: RegionInfo = {
        assignedCityIds: saDoc.assignedCityIds ?? [],
        assignedStateIds: saDoc.assignedStateIds ?? [],
      };
      const subset = await isRegionSubset(
        { cityIds: (assignedCityIds ?? []).map(String), stateIds: (assignedStateIds ?? []).map(String) },
        saRegion
      );
      if (!subset.valid) {
        return NextResponse.json(
          {
            error: "Agent regions must be within the super-agent's assigned territory.",
            invalidCityIds: subset.invalidCityIds,
            invalidStateIds: subset.invalidStateIds,
          },
          { status: 400 }
        );
      }
    }
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
    role: "agent",
    isActive: true,
  });

  try {
    // If agent belongs to a SA, inherit commission and region defaults
    let resolvedCommission = commissionRate ?? 0;
    let resolvedCityIds = assignedCityIds ?? [];
    let resolvedStateIds = assignedStateIds ?? [];

    if (superAgentId) {
      const saDoc = await SuperAgent.findById(superAgentId)
        .select("defaultAgentCommissionRate assignedCityIds assignedStateIds")
        .lean();
      if (saDoc) {
        if (resolvedCommission === 0 && saDoc.defaultAgentCommissionRate) {
          resolvedCommission = saDoc.defaultAgentCommissionRate;
        }
        if (resolvedCityIds.length === 0 && resolvedStateIds.length === 0) {
          resolvedCityIds = (saDoc.assignedCityIds ?? []).map((id: unknown) => String(id));
          resolvedStateIds = (saDoc.assignedStateIds ?? []).map((id: unknown) => String(id));
        }
      }
    }

    const agentDoc = await Agent.create({
      userId: user._id,
      superAgentId: superAgentId || undefined,
      commissionRate: resolvedCommission,
      assignedCityIds: resolvedCityIds,
      assignedStateIds: resolvedStateIds,
    });

    // Link to super agent
    if (superAgentId) {
      await SuperAgent.findByIdAndUpdate(superAgentId, {
        $addToSet: { agentIds: agentDoc._id },
      });

      // Notify super agent about new team member
      const saDoc = await SuperAgent.findById(superAgentId).select("userId").lean();
      if (saDoc?.userId) {
        const { notifySuperAgentAgentJoined } = await import("@/lib/notifications/trigger");
        notifySuperAgentAgentJoined(String(saDoc.userId), name, String(user._id)).catch((err) => { logger.error({ err, agentId: String(user._id), superAgentId }, "Failed to send agent joined notification"); });
      }
    }
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    logger.error({ err }, "[admin/agents] Profile creation failed");
    return NextResponse.json({ error: "Failed to create agent profile" }, { status: 500 });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "agent.create",
    resource: "agents",
    resourceId: String(user._id),
    req,
  });

  return NextResponse.json({ success: true, userId: user._id }, { status: 201 });
}

/**
 * PATCH /api/admin/agents — update agent user + profile
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const body = await validateBody(req, agentUpdateSchema);
  const { userId, name, email, isActive, superAgentId, commissionRate, assignedCityIds, assignedStateIds } = body;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // Resolve the super agent to validate region subset
  // Use the provided superAgentId, or fall back to current agent's super agent
  const effectiveSuperAgentId = superAgentId !== undefined ? superAgentId : undefined;
  if (effectiveSuperAgentId && (assignedCityIds?.length || assignedStateIds?.length)) {
    const saDoc = await SuperAgent.findById(effectiveSuperAgentId)
      .select("assignedCityIds assignedStateIds")
      .lean();
    if (saDoc) {
      const saRegion: RegionInfo = {
        assignedCityIds: saDoc.assignedCityIds ?? [],
        assignedStateIds: saDoc.assignedStateIds ?? [],
      };
      const subset = await isRegionSubset(
        { cityIds: (assignedCityIds ?? []).map(String), stateIds: (assignedStateIds ?? []).map(String) },
        saRegion
      );
      if (!subset.valid) {
        return NextResponse.json(
          {
            error: "Agent regions must be within the super-agent's assigned territory.",
            invalidCityIds: subset.invalidCityIds,
            invalidStateIds: subset.invalidStateIds,
          },
          { status: 400 }
        );
      }
    }
  }

  // Update user fields
  const userUpdate: Record<string, unknown> = {};
  if (name !== undefined) userUpdate.name = name;
  if (email !== undefined) userUpdate.email = email;
  if (isActive !== undefined) userUpdate.isActive = isActive;

  if (Object.keys(userUpdate).length > 0) {
    await User.findByIdAndUpdate(userId, { $set: userUpdate });
  }

  // Update or create agent profile
  const profileUpdate: Record<string, unknown> = {};
  if (superAgentId !== undefined) profileUpdate.superAgentId = superAgentId || null;
  if (commissionRate !== undefined) profileUpdate.commissionRate = commissionRate;
  if (assignedCityIds !== undefined) profileUpdate.assignedCityIds = assignedCityIds;
  if (assignedStateIds !== undefined) profileUpdate.assignedStateIds = assignedStateIds;

  // If assigning to a super agent and no region provided, inherit SA's region
  if (superAgentId && assignedCityIds === undefined && assignedStateIds === undefined) {
    const saDoc = await SuperAgent.findById(superAgentId)
      .select("assignedCityIds assignedStateIds")
      .lean();
    if (saDoc) {
      const existingAgent = await Agent.findOne({ userId }).select("assignedCityIds assignedStateIds").lean();
      const hasRegion = (existingAgent?.assignedCityIds?.length ?? 0) > 0 || (existingAgent?.assignedStateIds?.length ?? 0) > 0;
      if (!hasRegion) {
        profileUpdate.assignedCityIds = saDoc.assignedCityIds ?? [];
        profileUpdate.assignedStateIds = saDoc.assignedStateIds ?? [];
      }
    }
  }

  // Team membership is stored twice — Agent.superAgentId and SuperAgent.agentIds[] —
  // and only the creation paths maintained the array ($addToSet at :259, admin/users:295,
  // super-agent/agents:242). Reassigning here used to write superAgentId alone, so:
  //   • the previous super-agent kept the agent in agentIds forever (no $pull anywhere),
  //     retaining team-level access to their leads, commissions and even
  //     PATCH /api/super-agent/agents/[id] (commissionRate, isActive), and
  //   • the new super-agent never gained them in teamAgentIds, so scope-based routes
  //     stayed blind while reverse-lookup ones (invoices/uninvoiced-placements:51)
  //     already showed them.
  // Keep both sides in step whenever the owning super-agent changes.
  if (superAgentId !== undefined) {
    const current = await Agent.findOne({ userId }).select("_id superAgentId").lean();
    const previousSaId = current?.superAgentId ? String(current.superAgentId) : null;
    const nextSaId = superAgentId ? String(superAgentId) : null;
    if (current?._id && previousSaId !== nextSaId) {
      if (previousSaId) {
        await SuperAgent.findByIdAndUpdate(previousSaId, { $pull: { agentIds: current._id } });
      }
      if (nextSaId) {
        await SuperAgent.findByIdAndUpdate(nextSaId, { $addToSet: { agentIds: current._id } });
      }
    }
  }

  if (Object.keys(profileUpdate).length > 0) {
    await Agent.findOneAndUpdate(
      { userId },
      { $set: profileUpdate },
      { upsert: true, returnDocument: "after" }
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "agent.update",
    resource: "agents",
    resourceId: String(userId),
    changes: { after: { ...userUpdate, ...profileUpdate } },
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
