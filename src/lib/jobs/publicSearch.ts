import { escapeRegex } from "@/lib/security/sanitize";
import { getRegionCodeForCountryName, locationCountryRegex } from "@/lib/i18n/locations";

/** Longest search/location text the public job search reads; the rest is ignored. */
export const PUBLIC_SEARCH_MAX_LENGTH = 100;

/** How many comma-separated parts of a location ("Dubai, UAE") are matched. */
const MAX_LOCATION_PARTS = 3;

export function clampSearchText(value: string): string {
  return value.trim().slice(0, PUBLIC_SEARCH_MAX_LENGTH);
}

type LocationClause = Record<string, unknown>;

/**
 * One clause per comma-separated part of a free-text location, all of which must
 * match. Jobs file their country as a name ("United Arab Emirates") or a code
 * ("IN"), so a recognised country matches every spelling of it, and "Remote"
 * matches remote jobs. Input is escaped: it reaches Mongo as a regex.
 */
export function buildJobLocationClauses(location: string): LocationClause[] {
  const parts = clampSearchText(location)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, MAX_LOCATION_PARTS);

  return parts.map((part) => {
    if (/^remote$/i.test(part)) return { "location.isRemote": true };

    const literal = new RegExp(escapeRegex(part), "i");
    const options: LocationClause[] = [
      { "location.city": literal },
      { "location.country": literal },
    ];

    const code = getRegionCodeForCountryName(part);
    if (code) {
      options.push(
        { "location.country": new RegExp(locationCountryRegex(part), "i") },
        { "location.country": new RegExp(`^\\s*${code}\\s*$`, "i") },
      );
    }

    return { $or: options };
  });
}

/** Case-insensitive company-name matcher for the employer lookup behind keyword search. */
export function companyNameRegex(search: string): RegExp {
  return new RegExp(escapeRegex(clampSearchText(search)), "i");
}
