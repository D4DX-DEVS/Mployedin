import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { resolveEmployerRegion, summariseEmployerRegions } from "@/lib/agents/territoryCoverage";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * /api/employers/[id]/region — the region an employer sits in. `[id]` is the
 * employer's USER id, like its sibling routes.
 *
 * The region (a catalogue city) decides which super-agents and agents see the
 * company: everyone whose territory holds the city or its state. It is set at
 * signup and does not follow later address edits — moving an employer to
 * another region is this admin action. Jobs, applications and history are
 * not rewritten: they are scoped through the employer, so they move with it.
 */

const bodySchema = z.object({
  /** Catalogue city id, or null to take the employer out of every territory. */
  cityId: z.string().refine(isValidObjectId, "Invalid city id").nullable(),
});

async function loadEmployer(userId: string | undefined) {
  if (!isValidObjectId(userId)) return null;
  return Employer.findOne({ userId })
    .select("_id companyName regionCityId regionStateId")
    .lean<{ _id: unknown; companyName?: string; regionCityId?: unknown; regionStateId?: unknown } | null>();
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  await connectDB();
  const employer = await loadEmployer(params?.id);
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  const region = (await summariseEmployerRegions([employer])).get(String(employer._id)) ?? null;
  return NextResponse.json({ region });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const { cityId } = await validateBody(req, bodySchema);

  await connectDB();
  const employer = await loadEmployer(params?.id);
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const next = cityId ? await resolveEmployerRegion({ cityId }) : null;
  if (cityId && !next) {
    return NextResponse.json({ error: "Pick a city from the list." }, { status: 400 });
  }

  const before = (await summariseEmployerRegions([employer])).get(String(employer._id)) ?? null;
  const changed = String(employer.regionCityId ?? "") !== String(next?.cityId ?? "");
  if (changed) {
    await Employer.updateOne(
      { _id: employer._id },
      { $set: { regionCityId: next?.cityId ?? null, regionStateId: next?.stateId ?? null } },
    );
  }
  const region = next
    ? (await summariseEmployerRegions([{ _id: employer._id, regionCityId: next.cityId, regionStateId: next.stateId }]))
        .get(String(employer._id)) ?? null
    : null;

  if (changed) {
    await logActivity({
      ...actorFromCtx(ctx),
      action: "employer.change_region",
      resource: "employers",
      resourceId: params?.id,
      changes: {
        before: { city: before ? `${before.cityName}, ${before.countryCode}` : null, superAgents: before?.superAgents.map((s) => s.name) ?? [] },
        after: { city: region ? `${region.cityName}, ${region.countryCode}` : null, superAgents: region?.superAgents.map((s) => s.name) ?? [] },
      },
      req,
    });
  }

  return NextResponse.json({ changed, region });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "update" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
