import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import TargetProfile from "@/models/TargetProfile";
import "@/models/City";
import "@/models/State";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";
import { escapeRegex } from "@/lib/security/sanitize";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import bcrypt from "bcryptjs";
import { validateBody } from "@/lib/validators";
import { superAgentCreateSchema, superAgentUpdateSchema } from "@/lib/validators/admin";
import logger from "@/lib/logger";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

type DirectoryAvailability = "available" | "has_active_target" | "inactive";

interface DirectoryTargetProfileSummary {
  id: string;
  year: number;
  region?: string;
  overallProgress: number;
  riskScore: "high" | "medium" | "low";
}

function getLocationName(location: unknown): string | null {
  if (!location || typeof location !== "object") return null;

  const candidate = location as { name?: unknown; nameAr?: unknown };
  if (typeof candidate.name === "string" && candidate.name.trim()) return candidate.name.trim();
  if (typeof candidate.nameAr === "string" && candidate.nameAr.trim()) return candidate.nameAr.trim();
  return null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value && value.trim())))
  );
}

/**
 * GET /api/admin/super-agents — list super agents with profile data
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const { searchParams } = new URL(req.url);
  const directoryMode = searchParams.get("directory") === "create-target";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(directoryMode ? 500 : 100, parseInt(searchParams.get("limit") ?? "10"));
  const search = searchParams.get("search") ?? "";
  const targetYear = Math.max(2020, parseInt(searchParams.get("targetYear") ?? String(new Date().getFullYear())));
  const availabilityFilter = searchParams.get("availability") ?? "all";
  const riskFilter = searchParams.get("riskScore") ?? "all";
  const regionFilter = (searchParams.get("region") ?? "").trim().toLowerCase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { role: "super_agent" };
  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { name: new RegExp(safe, "i") },
      { email: new RegExp(safe, "i") },
    ];
  }

  const [users, total] = directoryMode
    ? await Promise.all([
        User.find(query)
          .select("-passwordHash")
          .sort({ isActive: -1, name: 1, createdAt: -1 })
          .lean(),
        User.countDocuments(query),
      ])
    : await Promise.all([
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
            defaultAgentCommissionRate: profile.defaultAgentCommissionRate ?? 0,
            assignedCityIds: profile.assignedCityIds,
            assignedStateIds: profile.assignedStateIds,
            agents,
            agentCount: agents.length,
          }
        : null,
    };
  });

      if (!directoryMode) {
        return NextResponse.json({
          superAgents: enriched,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      }

      const targetProfiles = await TargetProfile.find({
        assigneeId: { $in: userIds },
        assigneeRole: "super_agent",
        year: targetYear,
        status: "active",
      }).lean();

      const enrichedTargetProfiles = targetProfiles.length > 0
        ? await enrichProfiles(targetProfiles as unknown as Record<string, unknown>[])
        : [];

      const targetProfileMap = new Map<string, DirectoryTargetProfileSummary>(
        enrichedTargetProfiles.map((profile) => [
          profile.assigneeId,
          {
            id: profile._id,
            year: profile.year,
            region: profile.region,
            overallProgress: profile.overallProgress,
            riskScore: profile.riskScore,
          },
        ])
      );

      const directoryRows = enriched.map((user) => {
        const userId = user._id.toString();
        const profile = profileMap.get(userId);
        const regionNames = uniqueStrings([
          ...(profile?.assignedStateIds ?? []).map(getLocationName),
          ...(profile?.assignedCityIds ?? []).map(getLocationName),
          profile?.country,
        ]).sort((left, right) => left.localeCompare(right));
        const targetProfile = targetProfileMap.get(userId) ?? null;
        const availability: DirectoryAvailability = user.isActive === false
          ? "inactive"
          : targetProfile
            ? "has_active_target"
            : "available";

        return {
          ...user,
          directory: {
            teamSize: profile?.agentIds?.length ?? 0,
            regionNames,
            currencyCode: profile?.currencyCode ?? "AED",
            availability,
            availabilityReason:
              availability === "inactive"
                ? "Inactive supervisor"
                : availability === "has_active_target"
                  ? `Active ${targetYear} target profile already exists`
                  : null,
            targetProfile,
          },
        };
      });

      const filteredRows = directoryRows
        .filter((row) => {
          const directory = row.directory;
          if (availabilityFilter === "available" && directory.availability !== "available") return false;
          if (availabilityFilter === "has_active_target" && directory.availability !== "has_active_target") return false;
          if (availabilityFilter === "inactive" && directory.availability !== "inactive") return false;
          if (riskFilter !== "all" && directory.targetProfile?.riskScore !== riskFilter) return false;

          if (regionFilter) {
            const rowRegions = [
              ...directory.regionNames,
              directory.targetProfile?.region ?? "",
            ].map((value) => value.toLowerCase());

            if (!rowRegions.some((value) => value.includes(regionFilter))) {
              return false;
            }
          }

          return true;
        })
        .sort((left, right) => {
          const availabilityRank: Record<DirectoryAvailability, number> = {
            available: 0,
            has_active_target: 1,
            inactive: 2,
          };

          const leftAvailability = left.directory.availability as DirectoryAvailability;
          const rightAvailability = right.directory.availability as DirectoryAvailability;
          const availabilityDelta = availabilityRank[leftAvailability] - availabilityRank[rightAvailability];
          if (availabilityDelta !== 0) return availabilityDelta;
          return left.name.localeCompare(right.name);
        });

      const startIndex = (page - 1) * limit;
      const paginatedRows = filteredRows.slice(startIndex, startIndex + limit);
      const directoryRegions = Array.from(
        new Set(directoryRows.flatMap((row) => row.directory.regionNames))
      ).sort((left, right) => left.localeCompare(right));

      return NextResponse.json({
        superAgents: paginatedRows,
        directoryTotals: {
          matchingSupervisors: filteredRows.length,
          totalTeamSize: filteredRows.reduce((sum, row) => sum + row.directory.teamSize, 0),
          withActiveTarget: filteredRows.filter((row) => row.directory.targetProfile).length,
          highRiskProfiles: filteredRows.filter((row) => row.directory.targetProfile?.riskScore === "high").length,
        },
        directoryFilters: {
          regions: directoryRegions,
        },
        pagination: {
          page,
          limit,
          total: filteredRows.length,
          pages: Math.max(1, Math.ceil(filteredRows.length / limit)),
          unfilteredTotal: total,
        },
      });
}

/**
 * POST /api/admin/super-agents — create a super agent (user + profile)
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const body = await validateBody(req, superAgentCreateSchema);
  const { name, email, password, overrideCommissionRate, defaultAgentCommissionRate, assignedCityIds, assignedStateIds, agentIds } = body;

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
      defaultAgentCommissionRate: defaultAgentCommissionRate ?? 0,
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
    logger.error({ err }, "[admin/super-agents] Profile creation failed");
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
  const { userId, name, email, isActive, overrideCommissionRate, defaultAgentCommissionRate, assignedCityIds, assignedStateIds, agentIds } = body;

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
  if (defaultAgentCommissionRate !== undefined) profileUpdate.defaultAgentCommissionRate = defaultAgentCommissionRate;
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

    // Propagate region to agents under this super agent when SA region changes
    if (assignedCityIds !== undefined || assignedStateIds !== undefined) {
      const regionUpdate: Record<string, unknown> = {};
      if (assignedCityIds !== undefined) regionUpdate.assignedCityIds = assignedCityIds;
      if (assignedStateIds !== undefined) regionUpdate.assignedStateIds = assignedStateIds;

      await Agent.updateMany(
        { superAgentId: saDoc._id },
        { $set: regionUpdate }
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
