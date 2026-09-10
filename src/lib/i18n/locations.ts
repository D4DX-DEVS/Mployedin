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