import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Country from "@/models/Country";
import State from "@/models/State";
import City from "@/models/City";

/**
 * GET /api/filters/locations
 *
 * Cascading location data endpoint.
 * Query params:
 *   - level=countries → all active countries
 *   - level=states&countryId=xxx → states for a country
 *   - level=cities&stateId=xxx → cities for a state
 *   - search=xxx → search cities by name (returns up to 50)
 */
export async function GET(req: NextRequest) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level") ?? "countries";
  const countryId = searchParams.get("countryId");
  const stateId = searchParams.get("stateId");
  const search = searchParams.get("search");

  try {
    if (search) {
      // Search cities across all countries
      const cities = await City.find({
        isActive: true,
        name: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      })
        .sort({ name: 1 })
        .limit(50)
        .select("_id name nameAr stateId slug")
        .lean();

      // Enrich with state + country info
      const stateIds = [...new Set(cities.map((c) => c.stateId?.toString()))];
      const states = await State.find({ _id: { $in: stateIds } })
        .select("_id name countryId")
        .lean();
      const stateMap = new Map(states.map((s) => [s._id.toString(), s]));

      const countryIds = [...new Set(states.map((s) => s.countryId?.toString()))];
      const countries = await Country.find({ _id: { $in: countryIds } })
        .select("_id name code")
        .lean();
      const countryMap = new Map(countries.map((c) => [c._id.toString(), c]));

      const enriched = cities.map((city) => {
        const state = stateMap.get(city.stateId?.toString());
        const country = state ? countryMap.get(state.countryId?.toString()) : null;
        return {
          ...city,
          stateName: state?.name ?? "",
          countryName: country?.name ?? "",
          countryCode: (country as { code?: string })?.code ?? "",
        };
      });

      return NextResponse.json({ results: enriched });
    }

    switch (level) {
      case "countries": {
        const countries = await Country.find({ isActive: true })
          .sort({ sortOrder: 1, name: 1 })
          .select("_id name nameAr code")
          .lean();
        return NextResponse.json({ countries });
      }

      case "states": {
        if (!countryId) {
          return NextResponse.json({ error: "countryId required" }, { status: 400 });
        }
        const states = await State.find({ countryId, isActive: true })
          .sort({ sortOrder: 1, name: 1 })
          .select("_id name nameAr slug countryId")
          .lean();
        return NextResponse.json({ states });
      }

      case "cities": {
        if (!stateId) {
          return NextResponse.json({ error: "stateId required" }, { status: 400 });
        }
        const cities = await City.find({ stateId, isActive: true })
          .sort({ sortOrder: 1, name: 1 })
          .select("_id name nameAr slug stateId")
          .lean();
        return NextResponse.json({ cities });
      }

      default:
        return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }
  } catch (err) {
    console.error("[locations] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
