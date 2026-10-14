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
  /** "country" = every active state of that country is assigned (Qatar, Oman):
   *  shown as the country, not as a list of its states. */
  type: "city" | "state" | "country";
  name: string;
  /** Parent chain, nearest first: "Kerala, India" for a city, "India" for a state, "" for a country. */
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

  // A country whose every active state is assigned reads as the country.
  const wholeCountries = await fullyAssignedCountries(stateIds, states);

  const out: AssignedRegion[] = [];

  for (const countryId of wholeCountries) {
    out.push({ id: countryId, type: "country", name: pickName(countryMap.get(countryId), locale), parent: "" });
  }

  for (const id of stateIds) {
    const state = stateMap.get(id);
    if (!state) continue;
    if (wholeCountries.has(String(state.countryId ?? ""))) continue;
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

/**
 * Countries (ids) whose every active state is in `stateIds` — a country-level
 * grant is stored as all of its states, so the match rules (regionCityId /
 * regionStateId) need no country field.
 */
async function fullyAssignedCountries(
  stateIds: string[],
  states: (NamedDoc & { countryId?: unknown })[],
): Promise<Set<string>> {
  const assigned = new Set(stateIds);
  const candidates = [...new Set(
    states.filter((s) => assigned.has(String(s._id))).map((s) => String(s.countryId ?? "")).filter(Boolean),
  )];
  if (candidates.length === 0) return new Set();
  const all = await State.find({ countryId: { $in: candidates }, isActive: true })
    .select("_id countryId")
    .lean<{ _id: unknown; countryId?: unknown }[]>();
  const missing = new Set<string>();
  for (const s of all) if (!assigned.has(String(s._id))) missing.add(String(s.countryId ?? ""));
  const withStates = new Set(all.map((s) => String(s.countryId ?? "")));
  return new Set(candidates.filter((c) => withStates.has(c) && !missing.has(c)));
}
