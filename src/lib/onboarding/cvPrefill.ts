/**
 * What onboarding fills in from an imported CV.
 *
 * The AI reads a CV well; the form used to squeeze that reading into its single
 * fields badly (2026-09-30 report): the phone's own country code was ignored
 * and its digits landed under the +971 default, total experience was the
 * current job's length, the first job and first degree listed were shown
 * whatever they were, and the location never reached the area picker. These
 * helpers are the choices, kept out of the page so each is tested alone.
 */
import { findPhoneNumbersInText, type CountryCode } from "libphonenumber-js/min";
import { FALLBACK_PHONE_COUNTRIES } from "@/lib/phone/countries";
import { countryKeyFromLocationText } from "@/lib/i18n/locations";
import type { PickedCity } from "@/components/shared/CityPicker";

/** The form's experience-years list stops here. */
const MAX_FORM_YEARS = 30;
/** A stated total above this is a misreading (cv parsing drops it the same way). */
const MAX_STATED_YEARS = 60;
/** E.164 allows at most 15 digits. */
const MAX_PHONE_DIGITS = 15;

/** A dial code ("+91") and the national digits; no code when the CV wrote none. */
export interface CvPhone {
  dialCode?: string;
  phone: string;
  /** ISO country of the number, when it can be told (+1 is the US or Canada). */
  country?: string;
}

/**
 * Split a phone number as a CV writes it: "+91 97460 60086", "0091 …",
 * "+971 (0) 50 …" (trunk 0 dropped), or "971 50 …" and "050 …" read in the
 * country the CV says the seeker lives in. Only the first of several numbers
 * is taken, however they are joined ("66337079 - 33838683"). A number no
 * country recognises keeps its digits, and the code only when it was written
 * with a plus.
 */
export function splitCvPhone(raw: string | null | undefined, homeCountry?: string): CvPhone | null {
  // "00" before a country code, at the start or after a separator, is the international "+".
  const text = (raw ?? "").trim().replace(/(^|[/,;|:]\s*)00(?=[1-9])/g, "$1+");
  const found = findPhoneNumbersInText(text, homeCountry ? { defaultCountry: homeCountry as CountryCode } : undefined)
    .find((match) => match.number.isValid());
  if (found) {
    const { number } = found;
    return { dialCode: `+${number.countryCallingCode}`, phone: String(number.nationalNumber), country: number.country };
  }

  const first = text.split(/[/,;|]|\s[-–]\s|\bor\b/i).map((part) => part.trim()).find((part) => /\d/.test(part)) ?? "";
  const digits = first.replace(/\D/g, "");
  if (!digits) return null;
  if (!first.startsWith("+")) return { phone: digits.slice(0, MAX_PHONE_DIGITS) };
  // Longest code wins, so +971 is never read as +9 with a stray 71 left over.
  const dialCode = FALLBACK_PHONE_COUNTRIES
    .map((c) => c.dialCode)
    .filter((code) => `+${digits}`.startsWith(code))
    .sort((a, b) => b.length - a.length)[0];
  return dialCode
    ? { dialCode, phone: digits.slice(dialCode.length - 1).slice(0, MAX_PHONE_DIGITS) }
    : { phone: digits.slice(0, MAX_PHONE_DIGITS) };
}

/** A job's dates, however they arrived: a stored profile or the raw reading. */
export interface DatedJob {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isCurrent?: boolean;
}

/**
 * A month as a single number. Stored dates are UTC; "2025-03" and ISO strings
 * are read by their digits; anything else ("Jan 2019") is parsed as local time
 * and read back in local time — reading its UTC parts put it in December 2018
 * for anyone east of UTC.
 */
function monthIndex(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getUTCFullYear() * 12 + value.getUTCMonth();
  }
  const iso = /^(\d{4})(?:-(\d{2}))?/.exec(value.trim());
  if (iso) return Number(iso[1]) * 12 + (iso[2] ? Number(iso[2]) - 1 : 0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear() * 12 + date.getMonth();
}

/**
 * Total experience for the form's years/months selects.
 *
 * The figure the CV states ("6+ years of experience") comes first: it is what
 * the seeker claims, and a CV often leaves older jobs undated. Without one, the
 * dated jobs are added up with overlaps counted once. A past job's last month
 * counts ("Jan – Dec 2020" is a year); a past job with no end date has no
 * length and is skipped rather than guessed.
 */
export function totalExperience(
  statedYears: number | null | undefined,
  jobs: DatedJob[],
  now: Date = new Date(),
): { years: number; months: number } | null {
  const stated = Number(statedYears);
  let months: number;
  if (Number.isFinite(stated) && stated > 0 && stated <= MAX_STATED_YEARS) {
    months = Math.round(stated * 12);
  } else {
    const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const spans = jobs
      .map((job) => {
        const start = monthIndex(job.startDate);
        const ended = monthIndex(job.endDate);
        const end = job.isCurrent ? nowIndex : ended === null ? null : ended + 1;
        return start !== null && end !== null && end > start ? [start, end] as const : null;
      })
      .filter((span): span is readonly [number, number] => span !== null)
      .sort((a, b) => a[0] - b[0]);
    months = 0;
    let reachedTo = -Infinity;
    for (const [start, end] of spans) {
      if (end <= reachedTo) continue;
      months += end - Math.max(start, reachedTo);
      reachedTo = end;
    }
  }
  if (months <= 0) return null;
  if (months >= MAX_FORM_YEARS * 12) return { years: MAX_FORM_YEARS, months: 0 };
  return { years: Math.floor(months / 12), months: months % 12 };
}

/**
 * The job the form's single "current job" block should show: the one marked
 * current, else the latest start, else the first listed. CVs list jobs
 * newest-first or oldest-first, so position alone picks the wrong one.
 */
export function pickCurrentExperience<T extends DatedJob>(jobs: T[]): T | undefined {
  const latestFirst = (list: T[]) =>
    [...list].sort((a, b) => (monthIndex(b.startDate) ?? -Infinity) - (monthIndex(a.startDate) ?? -Infinity))[0];
  const current = jobs.filter((job) => job.isCurrent);
  if (current.length) return latestFirst(current);
  if (jobs.some((job) => monthIndex(job.startDate) !== null)) return latestFirst(jobs);
  return jobs[0];
}

/** Qualification levels, highest first — the values of the form's chips. */
const LEVEL_RANK = ["doctorate", "masters", "graduation", "12th", "10th", "below_10th"];

/**
 * The qualification the form's single education block should show: the
 * highest level, which is what the form asks for. Ties and unrecognised
 * degrees keep list order.
 */
export function pickHighestEducation<T>(entries: T[], levelOf: (entry: T) => string): T | undefined {
  const rank = (entry: T) => {
    const index = LEVEL_RANK.indexOf(levelOf(entry));
    return index === -1 ? LEVEL_RANK.length : index;
  };
  return entries.reduce<T | undefined>((best, entry) => (best === undefined || rank(entry) < rank(best) ? entry : best), undefined);
}

function countryCodeOf(text: string): string | null {
  const key = countryKeyFromLocationText(text)?.toUpperCase();
  return key && FALLBACK_PHONE_COUNTRIES.some((c) => c.code === key) ? key : null;
}

/**
 * Where the CV says the seeker lives, for the area picker: the country the
 * location line names, else the phone's country; and the first part of the
 * line as the city to look up. "Kochi, Kerala" + "+91" → India, "Kochi".
 *
 * A location ending in two letters is usually a state ("Boston, MA",
 * "Indianapolis, IN"), which the country lookup reads as Morocco or India, so
 * there the phone's country wins when there is one.
 */
export function areaFromCv({ location, phoneCountry, dialCode }: {
  location?: string | null;
  /** The phone number's own country, when it could be told. */
  phoneCountry?: string;
  dialCode?: string;
}): { countryCode: string; cityName: string } | null {
  const text = (location ?? "").trim();
  const segments = text.split(",").map((part) => part.trim()).filter(Boolean);
  const endsInTwoLetters = /^[A-Za-z]{2}$/.test(segments[segments.length - 1] ?? "");
  const fromText = text ? countryCodeOf(text) : null;
  const fromPhone = phoneCountry && FALLBACK_PHONE_COUNTRIES.some((c) => c.code === phoneCountry)
    ? phoneCountry
    : FALLBACK_PHONE_COUNTRIES.find((c) => c.dialCode === dialCode)?.code;
  const countryCode = (endsInTwoLetters ? fromPhone || fromText : fromText || fromPhone) || null;
  if (!countryCode) return null;
  const first = text.replace(/\([^)]*\)/g, " ").split(",")[0]?.trim() ?? "";
  const cityName = first && !countryCodeOf(first) ? first : "";
  return { countryCode, cityName };
}

/**
 * Cities better known by another name. The catalogue holds one of each pair
 * (Kochi is listed as "Cochin"), and a CV may use either.
 */
const CITY_ALIASES: string[][] = [
  ["Kochi", "Cochin"],
  ["Bengaluru", "Bangalore"],
  ["Mumbai", "Bombay"],
  ["Chennai", "Madras"],
  ["Kolkata", "Calcutta"],
  ["Thiruvananthapuram", "Trivandrum"],
  ["Kozhikode", "Calicut"],
  ["Thrissur", "Trichur"],
  ["Kannur", "Cannanore"],
  ["Mangaluru", "Mangalore"],
  ["Mysuru", "Mysore"],
  ["Puducherry", "Pondicherry"],
  ["Gurugram", "Gurgaon"],
  ["Vadodara", "Baroda"],
];

/** The name as written, then its other names. */
export function cityNameCandidates(name: string): string[] {
  const lower = name.trim().toLowerCase();
  const aliases = CITY_ALIASES.find((pair) => pair.some((n) => n.toLowerCase() === lower)) ?? [];
  return [name.trim(), ...aliases.filter((n) => n.toLowerCase() !== lower)];
}

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** The import waits for the city lookup; this long at most, then the seeker picks. */
const CITY_LOOKUP_TIMEOUT_MS = 4000;

/**
 * The catalogue city a CV's city name means, searched the way the area
 * picker searches. Only an exact name (or alias) counts: "Kochi" must not
 * become "Kochi Port". Anything uncertain, slow or failed returns null and the
 * seeker picks — the CV import waits on this, so it must never hang.
 */
export async function findCatalogueCity(
  countryCode: string,
  cityName: string,
  fetchFn: Fetcher = (url, init) => fetch(url, init),
  timeoutMs: number = CITY_LOOKUP_TIMEOUT_MS,
): Promise<PickedCity | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (const candidate of cityNameCandidates(cityName)) {
      if (controller.signal.aborted) break;
      try {
        const params = new URLSearchParams({ search: candidate, country: countryCode });
        const res = await fetchFn(`/api/filters/locations?${params}`, { signal: controller.signal });
        if (!res.ok) continue;
        const { results } = (await res.json()) as { results?: Array<{ _id: string; name: string }> };
        const exact = (results ?? []).filter((city) => city.name.trim().toLowerCase() === candidate.toLowerCase());
        if (exact.length === 1) return { id: String(exact[0]._id), name: exact[0].name };
      } catch {
        // Offline, aborted or timed out: leave the city to the seeker.
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
