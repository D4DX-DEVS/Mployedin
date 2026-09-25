import { NextResponse } from "next/server";
import type { RegionInfo } from "@/lib/auth/agentRestrictions";
import Country from "@/models/Country";
import State from "@/models/State";
import City from "@/models/City";

/**
 * The location cascade (`level=countries|states|cities`) in the same shape as
 * the public /api/filters/locations, narrowed to one super-agent's territory,
 * so a region picker only ever offers places the agent-region subset check
 * (isRegionSubset) will accept.
 *
 *   - level=countries              → countries containing any territory
 *   - level=states&countryId=xxx   → assigned states + parents of assigned cities
 *   - level=cities&stateId=xxx     → every city when the whole state is assigned,
 *                                    otherwise only the assigned cities.
 *                                    `stateFullyAssigned` says which.
 *
 * Empty / missing territory fails closed: empty lists, never the catalogue.
 * Callers own authorisation and the choice of whose region to pass.
 */
export async function territoryLocationsResponse(
  region: RegionInfo | null,
  searchParams: URLSearchParams
): Promise<NextResponse> {
  const level = searchParams.get("level") ?? "countries";
  const countryId = searchParams.get("countryId");
  const stateId = searchParams.get("stateId");

  const ownCityIds = (region?.assignedCityIds ?? []).map(String);
  const ownStateIds = (region?.assignedStateIds ?? []).map(String);

  if (ownCityIds.length === 0 && ownStateIds.length === 0) {
    if (level === "countries") return NextResponse.json({ countries: [] });
    if (level === "states") return NextResponse.json({ states: [] });
    if (level === "cities") return NextResponse.json({ cities: [], stateFullyAssigned: false });
    return NextResponse.json({ error: "Invalid level" }, { status: 400 });
  }

  /* States that may be drilled into: whole assigned states + parents of assigned cities. */
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
}
