import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";
import { escapeRegex } from "@/lib/security/sanitize";
import bcrypt from "bcryptjs";
import { validateBody } from "@/lib/validators";
import { agentCreateSchema, agentUpdateSchema } from "@/lib/validators/admin";

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

  const [users, total] = await Promise.all([
    User.find(query)
      .select("-passwordHash")
      .sort({ createdAt: -1 })
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

  // Enrich super agent names
  const superAgentUserIds = agentProfiles
    .filter((p) => p.superAgentId)
    .map((p) => {
      const sa = p.superAgentId as unknown as { userId: unknown };
      return sa?.userId;
    })
    .filter(Boolean);

  const saUsers = superAgentUserIds.length > 0
    ? await User.find({ _id: { $in: superAgentUserIds } }).select("name").lean()
    : [];
  const saNameMap = new Map(saUsers.map((u) => [u._id.toString(), u.name]));

  const enriched = users.map((user) => {
    const profile = profileMap.get(user._id.toString());
    const saProfile = profile?.superAgentId as unknown as { _id: unknown; userId: unknown } | undefined;
    const saUserId = saProfile?.userId?.toString();
    return {
      ...user,
      agentProfile: profile
        ? {
            _id: profile._id,
            superAgentId: profile.superAgentId,
            superAgentName: saUserId ? saNameMap.get(saUserId) : undefined,
            commissionRate: profile.commissionRate,
            assignedCityIds: profile.assignedCityIds,
            assignedStateIds: profile.assignedStateIds,
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
    const agentDoc = await Agent.create({
      userId: user._id,
      superAgentId: superAgentId || undefined,
      commissionRate: commissionRate ?? 0,
      assignedCityIds: assignedCityIds ?? [],
      assignedStateIds: assignedStateIds ?? [],
    });

    // Link to super agent
    if (superAgentId) {
      await SuperAgent.findByIdAndUpdate(superAgentId, {
        $addToSet: { agentIds: agentDoc._id },
      });
    }
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    console.error("[admin/agents] Profile creation failed:", err);
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

  if (Object.keys(profileUpdate).length > 0) {
    await Agent.findOneAndUpdate(
      { userId },
      { $set: profileUpdate },
      { upsert: true, new: true }
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
