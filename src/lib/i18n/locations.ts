import { escapeRegex } from "@/lib/security/sanitize";

export const COUNTRY_REGION_CODES: Record<string, string> = {
  "united arab emirates": "AE",
  uae: "AE",
  "u.a.e": "AE",
  "saudi arabia": "SA",
  ksa: "SA",
  qatar: "QA",
  kuwait: "KW",
  bahrain: "BH",
  oman: "OM",
  india: "IN",
  pakistan: "PK",
  philippines: "PH",
  egypt: "EG",
  jordan: "JO",
  lebanon: "LB",
  morocco: "MA",
  germany: "DE",
  france: "FR",
  "united states": "US",
  usa: "US",
  "u.s.a": "US",
  "united kingdom": "GB",
  uk: "GB",
};

type LocationLike = {
  city?: string;
  country?: string;
  isRemote?: boolean;
};

type LocationFormatOptions = {
  remoteLabel: string;
  fallback?: string;
  remoteGlobalLabel?: string;
  includeLocationForRemote?: boolean;
};

function normalizeLocationValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isRemoteGlobalValue(value: string): boolean {
  const normalized = normalizeLocationValue(value);
  return normalized === "remote / global" || normalized === "remote/global" || normalized === "remote global";
}

function uniqueParts(parts: string[]): string[] {
  const seen = new Set<string>();

  return parts.filter((part) => {
    const key = normalizeLocationValue(part);
    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

const REGION_CODES = new Set(Object.values(COUNTRY_REGION_CODES));

/**
 * Reduce a stored country string to the country it names. Real records — on the
 * seeker's preference side and the job's side alike — carry padding and
 * qualifiers ("Oman ", "Oman (Muscat)", "Saudi Arabia (Transferable Iqama)"),
 * none of which is a different country.
 */
export function canonicalCountry(value: string | null | undefined): string {
  return normalizeLocationValue((value ?? "").split("(")[0]);
}

/**
 * The single key two country strings must share to be the same country, however
 * each side was spelled. Jobs are filed as "IN" as often as "India", so both
 * collapse onto the region code; anything unrecognised falls back to its
 * canonical name so unknown countries still compare against themselves.
 */
export function countryKey(value: string | null | undefined): string {
  const base = canonicalCountry(value);
  if (!base) return "";
  const code = COUNTRY_REGION_CODES[base] ?? (REGION_CODES.has(base.toUpperCase()) ? base.toUpperCase() : null);
  return code ? code.toLowerCase() : base;
}

export function getRegionCodeForCountryName(countryName?: string | null): string | null {
  if (!countryName) return null;
  return COUNTRY_REGION_CODES[normalizeLocationValue(countryName)] ?? null;
}

export function getLocalizedCountryName(
  countryName: string | undefined | null,
  locale: string,
  options: { remoteGlobalLabel?: string } = {}
): string {
  const trimmed = countryName?.trim();
  if (!trimmed) return "";

  if (isRemoteGlobalValue(trimmed)) {
    return options.remoteGlobalLabel ?? trimmed;
  }

  const regionCode = getRegionCodeForCountryName(trimmed);
  if (!regionCode) return trimmed;

  return new Intl.DisplayNames([locale], { type: "region" }).of(regionCode) ?? trimmed;
}

export function formatLocalizedLocation(
  location: LocationLike | string | undefined,
  locale: string,
  options: LocationFormatOptions
): string {
  if (!location) return options.fallback ?? "";

  if (typeof location === "string") {
    return getLocalizedCountryName(location, locale, options) || options.fallback || "";
  }

  const city = getLocalizedCountryName(location.city, locale, options);
  const country = getLocalizedCountryName(location.country, locale, options);
  const parts = uniqueParts([city, country].filter(Boolean));

  if (location.isRemote) {
    if (!options.includeLocationForRemote || parts.length === 0) {
      return options.remoteLabel;
    }

    return `${parts.join(", ")} · ${options.remoteLabel}`;
  }

  return parts.join(", ") || options.fallback || "";
}

/* ------------------------------------------------------------------ */
/*  Countries named inside free-text locations                         */
/* ------------------------------------------------------------------ */

/**
 * A profile's location is one free-text line — "Dubai, UAE", "Riyadh, Al
 * Murooj, Saudi Arabia (Transferable Iqama)" — and the structured `country`
 * field is unset on real records. Staff directories still need a country facet
 * and a country filter, so both read the country out of that line, using the
 * one alias table the app already maintains.
 */

/** The fullest spelling of each country in the alias table, title-cased. */
const DISPLAY_NAME_BY_CODE: Map<string, string> = (() => {
  const longest = new Map<string, string>();
  for (const [alias, code] of Object.entries(COUNTRY_REGION_CODES)) {
    const current = longest.get(code);
    if (!current || alias.length > current.length) longest.set(code, alias);
  }
  return new Map(
    [...longest].map(([code, alias]) => [
      code,
      alias.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
    ]),
  );
})();

const ALIAS_MATCHERS: Array<{ code: string; pattern: RegExp }> = Object.entries(COUNTRY_REGION_CODES).map(
  ([alias, code]) => ({ code, pattern: new RegExp(`(^|[^A-Za-z])${escapeRegex(alias)}($|[^A-Za-z])`, "i") }),
);

/** Every known country named anywhere in a free-text location, by display name. */
export function countriesInLocationText(value: string | null | undefined): string[] {
  const text = (value ?? "").trim();
  if (!text) return [];
  const codes = new Set<string>();
  for (const { code, pattern } of ALIAS_MATCHERS) {
    if (pattern.test(text)) codes.add(code);
  }
  return [...codes].map((code) => DISPLAY_NAME_BY_CODE.get(code) ?? code);
}

/**
 * A case-insensitive regex source matching any spelling of one country inside a
 * location line. Unrecognised input matches only itself.
 */
export function locationCountryRegex(countryName: string): string {
  const code = getRegionCodeForCountryName(countryName);
  const aliases = code
    ? Object.entries(COUNTRY_REGION_CODES).filter(([, value]) => value === code).map(([alias]) => alias)
    : [canonicalCountry(countryName)];
  const spellings = aliases.filter(Boolean).map(escapeRegex);
  if (spellings.length === 0) return "(?!)";
  /* Plain ASCII boundaries: this source is handed to Mongo's regex engine as
     well as used in tests, and the alias table is ASCII throughout. */
  return `(^|[^A-Za-z])(${spellings.join("|")})($|[^A-Za-z])`;
}
