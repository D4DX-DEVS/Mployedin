/**
 * The timezone a seeker most likely reads their mail in, derived from the
 * country they say they are in.
 *
 * Why this exists: nothing on the platform records a real timezone for a job
 * seeker. `JobSeeker.settings.timezone` is null on every live profile, and
 * `NotificationPreference.timezone` carries its schema default `Asia/Dubai` on
 * every one of them — which `recipientZone.ts` already notes is
 * indistinguishable from never having been set. So a digest scheduled "at 9am
 * in the recipient's zone" has no zone to work from unless we infer one.
 *
 * Country is the honest granularity for that inference. It is the finest thing
 * the profile actually states, and for this platform's audience — the Gulf and
 * India, which is ~85% of live seekers — one country is one zone, so the
 * inference is exact rather than approximate.
 *
 * What this is NOT: a general country→timezone service. Countries spanning
 * several zones cannot be resolved from a country name, and are listed with the
 * zone containing the largest share of the population, marked below. For those,
 * a send time can be an hour or two off. That is a deliberate trade against the
 * alternative, which is mailing everyone at one fixed UTC hour.
 *
 * The real fix is to capture the browser's zone into
 * `JobSeeker.settings.timezone` at signup; this module is what makes the
 * feature work for the profiles that predate that.
 */

import { canonicalCountry, countryKey } from "@/lib/i18n/locations";
import { FALLBACK_TIME_ZONE, isValidTimeZone } from "@/lib/datetime/zone";

/**
 * Region code → IANA zone, keyed the way `countryKey()` returns them
 * (lowercase ISO-3166 alpha-2).
 *
 * Entries marked "largest-share" span more than one zone; the chosen zone is
 * where most of the population lives. Everything else is a single-zone country
 * and therefore exact.
 */
const ZONE_BY_REGION: Record<string, string> = {
  // Gulf — every one of these is a single zone.
  ae: "Asia/Dubai",
  sa: "Asia/Riyadh",
  om: "Asia/Muscat",
  qa: "Asia/Qatar",
  kw: "Asia/Kuwait",
  bh: "Asia/Bahrain",
  // South Asia — single zone each, including the half-hour offsets.
  in: "Asia/Kolkata",
  pk: "Asia/Karachi",
  lk: "Asia/Colombo",
  np: "Asia/Kathmandu",
  bd: "Asia/Dhaka",
  // Elsewhere, in the order these appear in COUNTRY_REGION_CODES.
  ph: "Asia/Manila",
  eg: "Africa/Cairo",
  jo: "Asia/Amman",
  lb: "Asia/Beirut",
  ma: "Africa/Casablanca",
  ng: "Africa/Lagos",
  ke: "Africa/Nairobi",
  et: "Africa/Addis_Ababa",
  de: "Europe/Berlin",
  fr: "Europe/Paris",
  gb: "Europe/London",
  us: "America/New_York", // largest-share: US spans six zones
};

/**
 * The zone for a country as written on a profile, or `null` when the country is
 * not one we can place.
 *
 * `null` rather than a fallback, so a caller can tell "this seeker is in India"
 * apart from "we have no idea where this seeker is" — the digest scheduler
 * needs that distinction to decide whether 9am means anything for them.
 */
export function timeZoneForCountry(value: string | null | undefined): string | null {
  const key = countryKey(value);
  if (!key) return null;
  return ZONE_BY_REGION[key] ?? null;
}

/**
 * The zone implied by a free-text location line such as
 * `"Jeddah, Saudi Arabia (Transferable Iqama)"`.
 *
 * `JobSeeker.currentLocation` is a single unvalidated string and the live
 * values are messy in every way a hand-typed field can be — extra qualifiers in
 * brackets, "N/A" city parts, three-part addresses, a stray trailing "..". The
 * one thing they hold to is that the country comes last, so that is what we
 * read, falling back to the whole string for the handful with no comma at all
 * (`"Saudi Arabia"`, `"Malappuram Kerala"`).
 *
 * Values naming two countries (`"UAE / Oman"`) resolve to neither and return
 * `null`: guessing which half the person is in would be inventing data.
 */
export function timeZoneForLocationText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;

  // Bracketed asides come off before the split, not after: several live values
  // put a comma *inside* the brackets ("N/A, Oman (Alkhuwair, Muscat)"), which
  // would otherwise make "Muscat)" the last segment and lose the country.
  const segments = text
    .replace(/\([^)]*\)/g, " ")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Last segment first, then the whole string for the comma-less values. Each
  // is tried as written before a punctuation-trimmed form, so "U.A.E" keeps the
  // dots that make it a key while "India.." still resolves.
  const last = segments[segments.length - 1];
  for (const candidate of [last, stripEdgePunctuation(last), text, stripEdgePunctuation(text)]) {
    if (!candidate) continue;
    const zone = timeZoneForCountry(candidate);
    if (zone) return zone;
  }
  return null;
}

/** Drop the stray leading/trailing punctuation hand-typed values collect. */
function stripEdgePunctuation(value: string | undefined): string {
  return (value ?? "").replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}]+$/u, "");
}

/** Sources a seeker's send-time zone can come from, most trustworthy first. */
export interface SeekerZoneSources {
  /** `JobSeeker.settings.timezone` — browser-detected, so the closest to truth. */
  profileTimeZone?: string | null;
  /** `JobSeeker.currentLocation` — free text, country read off the end. */
  currentLocation?: string | null;
}

/**
 * The zone to schedule a seeker's digest in.
 *
 * Deliberately does not consult `NotificationPreference.timezone`: it is
 * `Asia/Dubai` on all 224 live documents because that is its schema default, so
 * reading it would hand every Indian seeker a Gulf send time while looking like
 * a real preference. A stated location is weaker evidence in principle but
 * stronger in this data.
 */
export function digestTimeZoneFor(sources: SeekerZoneSources): string {
  if (isValidTimeZone(sources.profileTimeZone)) return sources.profileTimeZone as string;
  return timeZoneForLocationText(sources.currentLocation) ?? FALLBACK_TIME_ZONE;
}

/** The hour shown on a clock in `timeZone` at instant `now`, 0–23. */
export function localHourIn(timeZone: string, now: Date): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(now);
    return Number.parseInt(hour, 10);
  } catch {
    // An unknown zone must not throw inside a cron batch. Treating it as the
    // fallback zone's hour keeps the seeker on a defined schedule.
    return Number.parseInt(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: FALLBACK_TIME_ZONE,
        hour: "2-digit",
        hour12: false,
      }).format(now),
      10,
    );
  }
}

/**
 * The local hour digests are sent at.
 *
 * The cron checks hourly, so a zone offset by a whole hour is hit at exactly
 * 09:00 and a half-hour zone (India, Sri Lanka) at 09:30 — still morning, and
 * the alternative is a half-hourly cron for a thirty-minute gain.
 */
export const DIGEST_LOCAL_HOUR = 9;

/** Whether it is currently the send hour where this seeker is. */
export function isDigestHourFor(sources: SeekerZoneSources, now: Date): boolean {
  return localHourIn(digestTimeZoneFor(sources), now) === DIGEST_LOCAL_HOUR;
}

/** Exported for the canonical-name path in tests and for diagnostics. */
export { canonicalCountry };
