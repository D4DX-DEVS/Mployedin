/**
 * Resolve where a job and a candidate are to a city and state, then how near
 * they are (locality.ts). The job's country bounds every lookup: the City
 * collection holds same-named towns across countries ("Manama" is also in
 * Ajman), so a city is only ever looked up inside the job's country, and a
 * candidate who named another country is simply abroad.
 */

import City from "@/models/City";
import State from "@/models/State";
import Country from "@/models/Country";
import { countryKey } from "@/lib/i18n/locations";
import { escapeRegex } from "@/lib/security/sanitize";
import {
  canonicalCity,
  cityVariants,
  localityLevel,
  parsePlace,
  type Locality,
  type ResolvedPlace,
} from "@/lib/matching/locality";

interface CountryStates {
  stateIds: string[];
  /** Lower-cased state name → itself, for spotting "Kerala" in "Kochi, Kerala". */
  stateNames: Set<string>;
  stateNameById: Map<string, string>;
}

// Per-process caches. States never change at runtime; cities are bounded.
const statesByCountry = new Map<string, Promise<CountryStates | null>>();
const stateOfCity = new Map<string, Promise<string | null>>();
const CITY_CACHE_LIMIT = 5000;

function countryStates(key: string): Promise<CountryStates | null> {
  let cached = statesByCountry.get(key);
  if (!cached) {
    cached = (async () => {
      const country = await Country.findOne({ code: key.toUpperCase() }).select("_id").lean<{ _id: unknown } | null>();
      if (!country) return null;
      const states = await State.find({ countryId: country._id }).select("_id name").lean<Array<{ _id: unknown; name?: string }>>();
      const stateNameById = new Map(states.map((s) => [String(s._id), (s.name ?? "").toLowerCase().trim()]));
      return {
        stateIds: [...stateNameById.keys()],
        stateNames: new Set(stateNameById.values()),
        stateNameById,
      };
    })().catch(() => {
      // A failed load is retried next time, not remembered.
      statesByCountry.delete(key);
      return null;
    });
    statesByCountry.set(key, cached);
  }
  return cached;
}

function resolveCityState(key: string, city: string, states: CountryStates): Promise<string | null> {
  const cacheKey = `${key}|${canonicalCity(city)}`;
  let cached = stateOfCity.get(cacheKey);
  if (!cached) {
    const names = cityVariants(city).map((name) => new RegExp(`^${escapeRegex(name)}$`, "i"));
    cached = City.findOne({ stateId: { $in: states.stateIds }, name: { $in: names } })
      .select("stateId")
      .lean<{ stateId?: unknown } | null>()
      .then((doc) => (doc?.stateId ? states.stateNameById.get(String(doc.stateId)) ?? null : null))
      .catch(() => {
        stateOfCity.delete(cacheKey);
        return null;
      });
    if (stateOfCity.size >= CITY_CACHE_LIMIT) stateOfCity.clear();
    stateOfCity.set(cacheKey, cached);
  }
  return cached;
}

async function resolvePlace(text: string, jobCountry: string, states: CountryStates | null): Promise<ResolvedPlace | null> {
  const parsed = parsePlace(text);
  if (!parsed) return null;
  if (parsed.country && parsed.country !== jobCountry) return { city: parsed.city, state: null, country: parsed.country };
  if (!states) return { city: parsed.city, state: null, country: parsed.country };
  const named = parsed.parts.find((part) => states.stateNames.has(part)) ?? null;
  const state = named ?? (await resolveCityState(jobCountry, parsed.city, states));
  return { city: parsed.city, state, country: parsed.country ?? (state ? jobCountry : null) };
}

interface JobPlaceDoc {
  location?: { city?: string | null; country?: string | null; isRemote?: boolean | null } | null;
  workMode?: string | null;
}

interface SeekerPlaceDoc {
  currentLocation?: string | null;
  preferredLocations?: readonly string[] | null;
}

/**
 * Null for a remote job, or one with no city: nearness means nothing there.
 * Never throws — a failed lookup leaves the level less precise, not missing.
 */
export async function resolveLocality(job: JobPlaceDoc, seeker: SeekerPlaceDoc): Promise<Locality | null> {
  const workMode = (job.workMode ?? "").toLowerCase();
  if (job.location?.isRemote || workMode === "remote") return null;
  const jobCityText = (job.location?.city ?? "").trim();
  const jobCountry = countryKey(job.location?.country ?? "");
  if (!jobCityText || !jobCountry) return null;

  const states = await countryStates(jobCountry);
  const jobState = states ? await resolveCityState(jobCountry, jobCityText, states) : null;
  const jobPlace: ResolvedPlace = { city: canonicalCity(jobCityText), state: jobState, country: jobCountry };

  const texts = [seeker.currentLocation ?? "", ...(seeker.preferredLocations ?? [])].map((t) => t.trim()).filter(Boolean);
  const places = (await Promise.all(texts.map((t) => resolvePlace(t, jobCountry, states)))).filter(
    (p): p is ResolvedPlace => p !== null,
  );

  return {
    level: localityLevel(jobPlace, places),
    jobPlace: [jobCityText, job.location?.country ?? ""].filter(Boolean).join(", "),
    seekerPlace: seeker.currentLocation?.trim() || texts[0] || "",
  };
}
