import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Territory from "@/models/Territory";
import SuperAgent from "@/models/SuperAgent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { z } from "zod";

interface AuthCtx { userId: string; role: string; locale: string; }

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectIdStr = z.string().regex(objectIdRegex, "Invalid ObjectId");

const updateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  countries: z.array(z.string()).max(50).optional(),
  superAgentId: z.string().nullable().optional(),
  cityIds: z.array(objectIdStr).max(200).optional(),
  stateIds: z.array(objectIdStr).max(200).optional(),
});

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();
  const territory = await Territory.findById(id)
    .populate("superAgentId", "name email")
    .lean();
  if (!territory) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(territory);
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();

  const territory = await Territory.findById(id);
  if (!territory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { name, countries, superAgentId, cityIds, stateIds } = parsed.data;

  if (name !== undefined) territory.name = name;
  if (countries !== undefined) territory.countries = countries;
  if (cityIds !== undefined) territory.cityIds = cityIds as unknown as typeof territory.cityIds;
  if (stateIds !== undefined) territory.stateIds = stateIds as unknown as typeof territory.stateIds;

  // Handle super-agent assignment change
  if (superAgentId !== undefined) {
    const oldSA = territory.superAgentId?.toString();
    territory.superAgentId = superAgentId as unknown as typeof territory.superAgentId;

    // Sync city/state IDs to new super-agent
    const effectiveCityIds = cityIds ?? territory.cityIds.map((c: unknown) => String(c));
    const effectiveStateIds = stateIds ?? territory.stateIds.map((s: unknown) => String(s));

    if (superAgentId && (effectiveCityIds.length > 0 || effectiveStateIds.length > 0)) {
      await SuperAgent.findOneAndUpdate(
        { userId: superAgentId },
        {
          $addToSet: {
            ...(effectiveCityIds.length > 0 ? { assignedCityIds: { $each: effectiveCityIds } } : {}),
            ...(effectiveStateIds.length > 0 ? { assignedStateIds: { $each: effectiveStateIds } } : {}),
          },
        },
      );
    }

    // Remove from old super-agent if changed
    if (oldSA && oldSA !== superAgentId) {
      await SuperAgent.findOneAndUpdate(
        { userId: oldSA },
        {
          $pull: {
            ...(effectiveCityIds.length > 0 ? { assignedCityIds: { $in: effectiveCityIds } } : {}),
            ...(effectiveStateIds.length > 0 ? { assignedStateIds: { $in: effectiveStateIds } } : {}),
          },
        },
      );
    }
  }

  await territory.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "territory.update",
    resource: "territories",
    resourceId: id,
    changes: { after: parsed.data },
    req,
  });

  return NextResponse.json(territory);
}

async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = params?.id;
  if (!id || !isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  await connectDB();

  const territory = await Territory.findById(id);
  if (!territory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await Territory.findByIdAndDelete(id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "territory.delete",
    resource: "territories",
    resourceId: id,
    req: _req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "users", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "users", action: "update" });
