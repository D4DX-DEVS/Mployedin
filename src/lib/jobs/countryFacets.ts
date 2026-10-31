import { escapeRegex } from "@/lib/security/sanitize";
import { COUNTRY_REGION_CODES, canonicalCountry } from "@/lib/i18n/locations";

/**
 * The agent's Browse jobs country filter. Jobs store the country as typed:
 * "IN", "India", "india " and even a city or state ("Chennai", "Kerala"). The
 * filter offers one choice per real country, named in English, and the choice
 * matches every spelling of it (client check 2026-10-30).
 */

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
/** Region codes Intl names that are not countries. */
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "QO", "ZZ"]);

function nameOfCode(code: string): string | null {
  if (NOT_COUNTRIES.has(code) || (code.startsWith("X") && code !== "XK")) return null;
  try {
    const name = REGION_NAMES.of(code);
    return name && name !== code && name !== "Unknown Region" ? name : null;
  } catch {
    return null;
  }
}

let codeByName: Map<string, string> | null = null;
/** Every country's English name (lower case) to its code, built once. */
function codesByName(): Map<string, string> {
  if (codeByName) return codeByName;
  codeByName = new Map();
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = nameOfCode(code);
      if (name) codeByName.set(name.toLowerCase(), code);
    }
  }
  return codeByName;
}

/** The country code a stored value names, or null when it names no country. */
export function countryCodeOf(value: string | null | undefined): string | null {
  const base = canonicalCountry(value);
  if (!base) return null;
  const alias = COUNTRY_REGION_CODES[base];
  if (alias) return alias;
  if (/^[a-z]{2}$/.test(base)) return nameOfCode(base.toUpperCase()) ? base.toUpperCase() : null;
  return codesByName().get(base) ?? null;
}

/** One English name per country among the stored values, sorted; non-countries dropped. */
export function countryChoices(values: unknown[]): string[] {
  const names = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const code = countryCodeOf(value);
    const name = code ? nameOfCode(code) : null;
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Anchored, case-insensitive patterns for every spelling of the chosen country:
 * its name, its code and the aliases sharing it, each allowing a trailing
 * qualifier ("Oman (Muscat)"). A value that names no country matches itself.
 */
export function countrySpellings(value: string): RegExp[] {
  const code = countryCodeOf(value);
  const spellings = new Set<string>([canonicalCountry(value)]);
  if (code) {
    spellings.add(code.toLowerCase());
    const name = nameOfCode(code);
    if (name) spellings.add(name.toLowerCase());
    for (const [alias, aliasCode] of Object.entries(COUNTRY_REGION_CODES)) {
      if (aliasCode === code) spellings.add(alias);
    }
  }
  return [...spellings].filter(Boolean).map((s) => new RegExp(`^\\s*${escapeRegex(s)}\\s*(\\(.*)?$`, "i"));
}

/** A country choice in the reader's language ("India" → "الهند"). */
export function countryLabel(name: string, locale: string): string {
  const code = countryCodeOf(name);
  if (!code) return name;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? name;
  } catch {
    return name;
  }
}
