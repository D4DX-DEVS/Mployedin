import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentOwnRegion } from "@/lib/auth/agentRestrictions";
import Country from "@/models/Country";
import State from "@/models/State";
import City from "@/models/City";
import logger from "@/lib/logger";

/**
 * GET /api/super-agent/territory/locations
 *
 * Same cascade shape as the public /api/filters/locations, narrowed to the
 * calling super-agent's own territory so the region picker only ever offers
 * places the POST /api/super-agent/agents subset check will accept.
 *
 *   - level=countries              → countries containing any territory
 *   - level=states&countryId=xxx   → assigned states + parents of assigned cities
 *   - level=cities&stateId=xxx     → every city when the whole state is assigned,
 *                                    otherwise only the assigned cities.
 *                                    `stateFullyAssigned` says which.
 *
 * Empty / missing territory fails closed: empty lists, never the catalogue.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level") ?? "countries";
  const countryId = searchParams.get("countryId");
  const stateId = searchParams.get("stateId");

  try {
    const region = await getSuperAgentOwnRegion(ctx.userId);
    const ownCityIds = (region?.assignedCityIds ?? []).map(String);
    const ownStateIds = (region?.assignedStateIds ?? []).map(String);

    if (ownCityIds.length === 0 && ownStateIds.length === 0) {
      if (level === "countries") return NextResponse.json({ countries: [] });
      if (level === "states") return NextResponse.json({ states: [] });
      if (level === "cities") return NextResponse.json({ cities: [], stateFullyAssigned: false });
      return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }

    /* States the SA may drill into: whole assigned states + parents of assigned cities. */
    const resolveStateIds = async (): Promise<string[]> => {
      const ids = new Set(ownStateIds);
      if (ownCityIds.length > 0) {
        const parents = await City.find({ _id: { $in: ownCityIds } })
          .select("_id stateId")
          .lean();
        for (const c of parents) if (c.stateId) ids.add(String(c.stateId));
      }
      return Array.from(ids);
    };

    switch (level) {
      case "countries": {
        const stateIds = await resolveStateIds();
        const states = await State.find({ _id: { $in: stateIds } })
          .select("_id countryId")
          .lean();
        const countryIds = Array.from(new Set(states.map((s) => String(s.countryId)).filter(Boolean)));
        if (countryIds.length === 0) return NextResponse.json({ countries: [] });
        const countries = await Country.find({ _id: { $in: countryIds }, isActive: true })
          .sort({ sortOrder: 1, name: 1 })
          .select("_id name nameAr code")
          .lean();
        return NextResponse.json({ countries });
      }

      case "states": {
        if (!countryId) {
          return NextResponse.json({ error: "countryId required" }, { status: 400 });
        }
        const stateIds = await resolveStateIds();
        const states = await State.find({ _id: { $in: stateIds }, countryId, isActive: true })
          .sort({ sortOrder: 1, name: 1 })
          .select("_id name nameAr slug countryId")
          .lean();
        return NextResponse.json({ states });
      }

      case "cities": {
        if (!stateId) {
          return NextResponse.json({ error: "stateId required" }, { status: 400 });
        }
        const stateFullyAssigned = ownStateIds.includes(stateId);
        const filter: Record<string, unknown> = stateFullyAssigned
          ? { stateId, isActive: true }
          : { _id: { $in: ownCityIds }, stateId, isActive: true };
        const cities =
          !stateFullyAssigned && ownCityIds.length === 0
            ? []
            : await City.find(filter)
                .sort({ sortOrder: 1, name: 1 })
                .select("_id name nameAr slug stateId")
                .lean();
        return NextResponse.json({ cities, stateFullyAssigned });
      }

      default:
        return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }
  } catch (err) {
    logger.error({ err }, "[super-agent/territory/locations] Error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const GET = withAuth(handler);
