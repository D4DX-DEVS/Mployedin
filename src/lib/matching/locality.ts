/**
 * How near a candidate is to an on-site job: same city, same state, same
 * country, or abroad. Naukri and LinkedIn rank the local candidate first for
 * on-site work; the seeker engine only knows countries.
 *
 * Pure. The state of a city comes from the City/State collections via
 * locality.server.ts; this file decides the level from what was resolved.
 */

import { countryKeyFromLocationText } from "@/lib/i18n/locations";

export type LocalityLevel = "same_city" | "same_state" | "same_country" | "abroad" | "unknown";

export interface Locality {
  level: LocalityLevel;
  /** The job's place as the employer typed it ("Ernakulam, India"). */
  jobPlace: string;
  /** The candidate's place as they typed it ("Kochi, Kerala, India"). */
  seekerPlace: string;
}

/** Points added to the employer's ranking score. Small on purpose: nearness breaks ties, it does not outrank skills. */
export const LOCALITY_POINTS: Record<LocalityLevel, number> = {
  same_city: 4,
  same_state: 2,
  same_country: 0,
  abroad: -3,
  unknown: 0,
};

/**
 * Cities known by more than one name — renamed ones, and a metro's twin names.
 * Each group's first entry is the canonical form.
 */
const CITY_ALIASES: readonly (readonly string[])[] = [
  ["kochi", "cochin", "ernakulam"],
  ["kozhikode", "calicut"],
  ["thiruvananthapuram", "trivandrum"],
  ["thrissur", "trichur"],
  ["alappuzha", "alleppey"],
  ["kannur", "cannanore"],
  ["kollam", "quilon"],
  ["palakkad", "palghat"],
  ["bengaluru", "bangalore"],
  ["mumbai", "bombay"],
  ["chennai", "madras"],
  ["kolkata", "calcutta"],
  ["gurugram", "gurgaon"],
  ["pune", "poona"],
  ["mysuru", "mysore"],
  ["puducherry", "pondicherry"],
  ["vadodara", "baroda"],
  ["prayagraj", "allahabad"],
  ["new delhi", "delhi"],
];

const CANONICAL = new Map<string, string>(CITY_ALIASES.flatMap((group) => group.map((name) => [name, group[0]] as const)));

const clean = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** One spelling per city: "Cochin" and "Ernakulam" both read "kochi". */
export function canonicalCity(name: string): string {
  const key = clean(name);
  return CANONICAL.get(key) ?? key;
}

/** Every spelling of a city, for a lookup by name. */
export function cityVariants(name: string): string[] {
  const canonical = canonicalCity(name);
  const group = CITY_ALIASES.find((g) => g[0] === canonical);
  return group ? [...group] : [canonical];
}

export interface ParsedPlace {
  /** The first part, canonicalised — free text puts the city first. */
  city: string;
  /** Every comma-separated part, lower-cased: a state is looked up among these. */
  parts: string[];
  /** Country key when the text names one ("in", "bh"), else null. */
  country: string | null;
}

/** "Kochi, Kerala, India" → city kochi, parts [kochi, kerala, india], country "in". */
export function parsePlace(text: string | null | undefined): ParsedPlace | null {
  const parts = (text ?? "").split(/[,/|]+/).map(clean).filter(Boolean);
  if (parts.length === 0) return null;
  return { city: canonicalCity(parts[0]), parts, country: countryKeyFromLocationText(text ?? "") };
}

export interface ResolvedPlace {
  city: string | null;
  state: string | null;
  country: string | null;
}

const RANK: Record<LocalityLevel, number> = { same_city: 4, same_state: 3, same_country: 2, unknown: 1, abroad: 0 };

/**
 * The nearest of the candidate's places — where they live and where they said
 * they would work — to the job. A place in another country is abroad; a
 * place with no country is taken to be in the job's country only if its city
 * or state resolved there.
 */
export function localityLevel(job: ResolvedPlace, places: readonly ResolvedPlace[]): LocalityLevel {
  let best: LocalityLevel = "unknown";
  let seenAny = false;
  for (const place of places) {
    let level: LocalityLevel;
    if (place.country && job.country && place.country !== job.country) level = "abroad";
    else if (place.city && job.city && place.city === job.city) level = "same_city";
    else if (place.state && job.state && place.state === job.state) level = "same_state";
    else if (place.country && place.country === job.country) level = "same_country";
    else if (place.state) level = "same_country";
    else level = "unknown";
    if (!seenAny || RANK[level] > RANK[best]) best = level;
    seenAny = true;
  }
  return best;
}
