import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Territory from "@/models/Territory";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { regionLocale, resolveAssignedRegions } from "@/lib/agents/assignedRegion";
import { setSuperAgentRegion } from "@/lib/superAgent/regions";
import {
  regionIdsError,
  regionWarnings,
  superAgentUserError,
  territoryInputSchema,
  type TerritoryRow,
  type TerritorySuperAgentOption,
} from "@/lib/superAgent/territories";

interface AuthCtx { userId: string; role: string; locale: string; }

/**
 * GET /api/admin/territories
 *
 * One row per super agent's territory, read from the region on their profile —
 * the region every super-agent screen uses. A named Territory supplies the
 * name; a super agent with a region but no name still gets a row, so nothing
 * an admin assigned on the Super Agents page is hidden here. A Territory whose
 * super agent is gone shows without one, for the admin to reassign or remove.
 */
const TERRITORY_SORTS = ["superAgent", "name", "agentCount"] as const;
type TerritorySort = (typeof TERRITORY_SORTS)[number];

/** Rows are built in memory, so they sort here. Blank names go last either way. */
function sortTerritoryRows(rows: TerritoryRow[], by: TerritorySort, dir: 1 | -1): TerritoryRow[] {
  const text = (row: TerritoryRow) => (by === "name" ? row.name : row.superAgent?.name) || null;
  return [...rows].sort((a, b) => {
    if (by === "agentCount") return (a.agentCount - b.agentCount) * dir;
    const x = text(a);
    const y = text(b);
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return x.localeCompare(y, undefined, { sensitivity: "base" }) * dir;
  });
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = req.nextUrl;
  const search = (searchParams.get("search")?.trim() ?? "").trim().toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const locale = regionLocale(searchParams.get("locale"), ctx.locale);
  const sortParam = searchParams.get("sortBy") ?? "";
  const sortBy: TerritorySort = (TERRITORY_SORTS as readonly string[]).includes(sortParam) ? (sortParam as TerritorySort) : "superAgent";
  const sortDir = searchParams.get("sortOrder") === "desc" ? -1 : 1;

  const [profiles, territories] = await Promise.all([
    SuperAgent.find({ roleArchivedAt: null }).select("_id userId assignedCityIds assignedStateIds").lean(),
    Territory.find({}).select("_id name superAgentId updatedAt").sort({ updatedAt: -1 }).lean(),
  ]);
  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) }, role: "super_agent" })
    .select("_id name email avatar")
    .lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const liveProfiles = profiles.filter((p) => userById.has(String(p.userId)));
  const profileByUser = new Map(liveProfiles.map((p) => [String(p.userId), p]));

  const agentCounts = await Agent.aggregate<{ _id: unknown; n: number }>([
    { $match: { superAgentId: { $in: liveProfiles.map((p) => p._id) } } },
    { $group: { _id: "$superAgentId", n: { $sum: 1 } } },
  ]);
  const agentsByProfile = new Map(agentCounts.map((c) => [String(c._id), c.n]));

  const territoryByUser = new Map<string, (typeof territories)[number]>();
  for (const territory of territories) {
    const owner = territory.superAgentId ? String(territory.superAgentId) : "";
    if (owner && profileByUser.has(owner) && !territoryByUser.has(owner)) territoryByUser.set(owner, territory);
  }

  const superAgentOptions: TerritorySuperAgentOption[] = liveProfiles.map((p) => {
    const user = userById.get(String(p.userId))!;
    return {
      userId: String(p.userId),
      name: user.name ?? "",
      email: user.email ?? "",
      territoryId: territoryByUser.has(String(p.userId)) ? String(territoryByUser.get(String(p.userId))!._id) : null,
      cityIds: (p.assignedCityIds ?? []).map(String),
      stateIds: (p.assignedStateIds ?? []).map(String),
    };
  });

  const rows: TerritoryRow[] = [];
  for (const option of superAgentOptions) {
    const territory = territoryByUser.get(option.userId);
    if (!territory && option.cityIds.length === 0 && option.stateIds.length === 0) continue;
    const profile = profileByUser.get(option.userId)!;
    rows.push({
      key: territory ? String(territory._id) : `sa:${option.userId}`,
      territoryId: territory ? String(territory._id) : null,
      name: territory?.name ?? null,
      superAgent: {
        userId: option.userId,
        name: option.name,
        email: option.email,
        avatar: userById.get(option.userId)?.avatar ?? null,
      },
      regions: await resolveAssignedRegions(profile, locale),
      cityIds: option.cityIds,
      stateIds: option.stateIds,
      agentCount: agentsByProfile.get(String(profile._id)) ?? 0,
      updatedAt: territory?.updatedAt ? new Date(territory.updatedAt).toISOString() : null,
    });
  }
  const shown = new Set(rows.map((r) => r.territoryId).filter(Boolean));
  for (const territory of territories) {
    if (shown.has(String(territory._id))) continue;
    rows.push({
      key: String(territory._id),
      territoryId: String(territory._id),
      name: territory.name,
      superAgent: null,
      regions: [],
      cityIds: [],
      stateIds: [],
      agentCount: 0,
      updatedAt: territory.updatedAt ? new Date(territory.updatedAt).toISOString() : null,
    });
  }

  const matching = search
    ? rows.filter((row) =>
        [row.name, row.superAgent?.name, row.superAgent?.email, ...row.regions.map((r) => r.name)]
          .some((value) => value?.toLowerCase().includes(search)),
      )
    : rows;
  const sorted = sortTerritoryRows(matching, sortBy, sortDir);

  return NextResponse.json({
    items: sorted.slice((page - 1) * limit, page * limit),
    total: sorted.length,
    page,
    limit,
    superAgents: superAgentOptions,
  });
}

/**
 * POST /api/admin/territories — name a super agent's territory and set its
 * region. The region is written to the super agent's own profile, so it is
 * what they see on their dashboard, profile and Territory page, and what
 * scopes their agents, employers and leads.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const parsed = territoryInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { name, superAgentId, cityIds, stateIds } = parsed.data;

  const invalid = (await superAgentUserError(superAgentId)) ?? (await regionIdsError(cityIds, stateIds));
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const existing = await Territory.findOne({ superAgentId }).select("name").lean();
  if (existing) {
    return NextResponse.json(
      { error: `This super agent already has the territory "${existing.name}". Edit that one instead.` },
      { status: 409 },
    );
  }

  const result = await setSuperAgentRegion(superAgentId, { cityIds, stateIds });
  if (!result) {
    return NextResponse.json({ error: "Super agent profile not found" }, { status: 404 });
  }
  const territory = await Territory.create({ name, superAgentId });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "territory.create",
    resource: "territories",
    resourceId: String(territory._id),
    meta: { name, superAgentId, cityIds, stateIds, trimmedAgents: result.trimmedAgents },
    req,
  });

  return NextResponse.json(
    { territory, trimmedAgents: result.trimmedAgents, ...regionWarnings(result.conflicts) },
    { status: 201 },
  );
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const POST = withAuth(postHandler, { resource: "users", action: "update" });
