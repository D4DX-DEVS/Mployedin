import type mongoose from "mongoose";
import City from "@/models/City";
import State from "@/models/State";
import Country from "@/models/Country";

/**
 * One region an admin assigned to an agent or super-agent, resolved to names.
 *
 * Only the ids live on the Agent / SuperAgent document (`assignedCityIds`,
 * `assignedStateIds`), so every screen that wants to say "you cover Tirur"
 * has to walk City → State → Country. This is that walk, done once.
 */
export interface AssignedRegion {
  id: string;
  type: "city" | "state";
  name: string;
  /** Parent chain, nearest first: "Kerala, India" for a city, "India" for a state. */
  parent: string;
}

interface RegionIds {
  assignedCityIds?: readonly (mongoose.Types.ObjectId | string)[] | null;
  assignedStateIds?: readonly (mongoose.Types.ObjectId | string)[] | null;
}

interface NamedDoc {
  _id: unknown;
  name?: string;
  nameAr?: string;
}

/**
 * The locale to name regions in: the page's own (`?locale=` from the client),
 * falling back to the user's saved preference. Only locales we ship.
 */
export function regionLocale(requested: string | null | undefined, fallback: string): string {
  return requested === "ar" || requested === "en" ? requested : fallback;
}

function pickName(doc: NamedDoc | undefined, locale: string): string {
  if (!doc) return "";
  if (locale === "ar" && doc.nameAr) return doc.nameAr;
  return doc.name ?? "";
}

/**
 * Resolve assigned city/state ids to display names, in assignment order —
 * states first (the broader grant), then cities. Ids that no longer resolve
 * (a deleted city) are dropped rather than shown as blanks.
 */
export async function resolveAssignedRegions(
  region: RegionIds | null | undefined,
  locale: string,
): Promise<AssignedRegion[]> {
  const cityIds = (region?.assignedCityIds ?? []).map(String);
  const stateIds = (region?.assignedStateIds ?? []).map(String);
  if (cityIds.length === 0 && stateIds.length === 0) return [];

  const cities = cityIds.length
    ? await City.find({ _id: { $in: cityIds } }).select("name nameAr stateId").lean<(NamedDoc & { stateId?: unknown })[]>()
    : [];

  // A city's parent state is needed for its label even when the state itself
  // was not assigned.
  const allStateIds = [...new Set([...stateIds, ...cities.map((c) => String(c.stateId ?? ""))].filter(Boolean))];
  const states = allStateIds.length
    ? await State.find({ _id: { $in: allStateIds } }).select("name nameAr countryId").lean<(NamedDoc & { countryId?: unknown })[]>()
    : [];

  const countryIds = [...new Set(states.map((s) => String(s.countryId ?? "")).filter(Boolean))];
  const countries = countryIds.length
    ? await Country.find({ _id: { $in: countryIds } }).select("name nameAr").lean<NamedDoc[]>()
    : [];

  const cityMap = new Map(cities.map((c) => [String(c._id), c]));
  const stateMap = new Map(states.map((s) => [String(s._id), s]));
  const countryMap = new Map(countries.map((c) => [String(c._id), c]));

  const countryOf = (state: (NamedDoc & { countryId?: unknown }) | undefined) =>
    pickName(countryMap.get(String(state?.countryId ?? "")), locale);

  const out: AssignedRegion[] = [];

  for (const id of stateIds) {
    const state = stateMap.get(id);
    if (!state) continue;
    out.push({ id, type: "state", name: pickName(state, locale), parent: countryOf(state) });
  }

  for (const id of cityIds) {
    const city = cityMap.get(id);
    if (!city) continue;
    const state = stateMap.get(String(city.stateId ?? ""));
    const parent = [pickName(state, locale), countryOf(state)].filter(Boolean).join(", ");
    out.push({ id, type: "city", name: pickName(city, locale), parent });
  }

  return out;
}
