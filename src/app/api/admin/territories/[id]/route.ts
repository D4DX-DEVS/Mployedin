import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Territory from "@/models/Territory";
import SuperAgent from "@/models/SuperAgent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { setSuperAgentRegion } from "@/lib/superAgent/regions";
import {
  regionIdsError,
  regionWarnings,
  superAgentUserError,
  territoryUpdateSchema,
} from "@/lib/superAgent/territories";

interface AuthCtx { userId: string; role: string; locale: string; }

async function loadTerritory(ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const id = params?.id;
  if (!id || !isValidObjectId(id)) {
    return { error: NextResponse.json({ error: "Invalid ID" }, { status: 400 }) };
  }
  await connectDB();
  const territory = await Territory.findById(id);
  if (!territory) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { id, territory };
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const loaded = await loadTerritory(ctx, params);
  if (loaded.error) return loaded.error;
  return NextResponse.json({ territory: loaded.territory.toObject() });
}

/**
 * PATCH /api/admin/territories/:id — rename, re-draw the region, or hand the
 * territory to another super agent. The region is written to the (new) super
 * agent's profile and their agents are trimmed to fit, as on the Super Agents
 * form. Handing it over clears the previous super agent's region; their agents
 * keep their cities until the admin draws a new region for them.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const loaded = await loadTerritory(ctx, params);
  if (loaded.error) return loaded.error;
  const { id, territory } = loaded;

  const parsed = territoryUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { name, superAgentId, cityIds, stateIds } = parsed.data;

  const previousOwner = territory.superAgentId ? String(territory.superAgentId) : null;
  const owner = superAgentId ?? previousOwner;
  if (!owner) {
    return NextResponse.json({ error: "Pick the super agent this territory belongs to" }, { status: 400 });
  }
  const moving = owner !== previousOwner;

  if (moving) {
    const saError = await superAgentUserError(owner);
    if (saError) return NextResponse.json({ error: saError }, { status: 400 });
    const taken = await Territory.findOne({ superAgentId: owner, _id: { $ne: id } }).select("name").lean();
    if (taken) {
      return NextResponse.json(
        { error: `That super agent already has the territory "${taken.name}".` },
        { status: 409 },
      );
    }
  }

  // The region to write: what the form sent, else (on a hand-over) the region
  // the previous super agent held, so moving a territory moves its places.
  let region: { cityIds: string[]; stateIds: string[] } | null = null;
  if (cityIds !== undefined || stateIds !== undefined || moving) {
    const current = previousOwner
      ? await SuperAgent.findOne({ userId: previousOwner }).select("assignedCityIds assignedStateIds").lean()
      : null;
    region = {
      cityIds: cityIds ?? (current?.assignedCityIds ?? []).map(String),
      stateIds: stateIds ?? (current?.assignedStateIds ?? []).map(String),
    };
    if (region.cityIds.length + region.stateIds.length === 0) {
      return NextResponse.json({ error: "Pick at least one state or city" }, { status: 400 });
    }
    const regionError = await regionIdsError(region.cityIds, region.stateIds);
    if (regionError) return NextResponse.json({ error: regionError }, { status: 400 });
  }

  const result = region ? await setSuperAgentRegion(owner, region) : null;
  if (region && !result) {
    return NextResponse.json({ error: "Super agent profile not found" }, { status: 404 });
  }
  if (moving && previousOwner) {
    await setSuperAgentRegion(previousOwner, { cityIds: [], stateIds: [] }, { trimAgents: false });
  }

  if (name !== undefined) territory.name = name;
  territory.set("superAgentId", owner);
  await territory.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "territory.update",
    resource: "territories",
    resourceId: id,
    changes: {
      before: { superAgentId: previousOwner },
      after: { ...parsed.data, trimmedAgents: result?.trimmedAgents ?? 0 },
    },
    req,
  });

  return NextResponse.json({
    territory: territory.toObject(),
    trimmedAgents: result?.trimmedAgents ?? 0,
    ...regionWarnings(result?.conflicts ?? []),
  });
}

/**
 * DELETE /api/admin/territories/:id — the super agent stops covering the
 * territory: its name goes and their region is cleared. Their agents keep
 * their own cities, so nothing downstream is lost if the admin re-draws it.
 */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const loaded = await loadTerritory(ctx, params);
  if (loaded.error) return loaded.error;
  const { id, territory } = loaded;

  const owner = territory.superAgentId ? String(territory.superAgentId) : null;
  if (owner) await setSuperAgentRegion(owner, { cityIds: [], stateIds: [] }, { trimAgents: false });
  await Territory.findByIdAndDelete(id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "territory.delete",
    resource: "territories",
    resourceId: id,
    meta: { name: territory.name, superAgentId: owner },
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "users", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "users", action: "update" });
