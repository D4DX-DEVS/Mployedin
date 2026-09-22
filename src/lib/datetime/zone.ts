/**
 * Zone-aware date/time formatting.
 *
 * Two rules, both learned the hard way:
 *
 * 1. A stored `scheduledAt` is an instant, not a wall time. Render it in the
 *    *reader's* zone — never a hardcoded one. Notification bodies used to be
 *    baked with `timeZone: "Asia/Dubai"`, so a London candidate was emailed
 *    14:00 for an interview their own calendar showed at 10:00.
 *
 * 2. Print the zone. A bare "10:00" on a cross-border interview is ambiguous
 *    to both sides, and neither can tell whether the other is looking at the
 *    same number.
 *
 * `timeZoneName: "short"` gives the clearest label ICU has for a zone. Which
 * form you get is locale-dependent: `en-GB` says "GST"/"BST", `en-US` (this
 * app's `DEFAULT_INTL_LOCALE`) says "GMT+4"/"GMT+1". Both are unambiguous, and
 * the offset form is arguably the better one — "IST" alone means India, Israel
 * and Ireland.
 *
 * Locale goes through `resolveIntlLocale` rather than being used raw, so the
 * server and the browser always produce the same string. A label that differs
 * between the two is a hydration failure, which is the bug `lib/ui/intlFormat`
 * exists to prevent.
 */

import { resolveIntlLocale } from "@/lib/ui/intlFormat";

/**
 * Used when no zone is known for a reader.
 *
 * Deliberately a fixed zone, not the runtime's own: a "use client" component
 * still renders once on the server, so a viewer-zone fallback would produce
 * one string on the server and another in the browser — a hydration failure.
 * It also matches how pre-existing notifications were composed, so old rows
 * keep reading the way they were written.
 */
export const FALLBACK_TIME_ZONE = "Asia/Dubai";

export interface ZoneFormatOptions {
  /** IANA zone. Defaults to the viewer's own zone; an unknown zone falls back to it too. */
  timeZone?: string;
  locale?: string;
  dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
}

/** The zone this runtime is in — the browser's on the client, the server's on the server. */
export function resolveViewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Whether a stored value is a zone this runtime knows.
 *
 * Profile zones are user-editable strings that also arrive from browser
 * detection and old seed data, so a stale or hand-typed one must not throw
 * a RangeError out of a page render or an email send.
 */
export function isValidTimeZone(timeZone?: string | null): boolean {
  if (!timeZone || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function safeZone(timeZone?: string): string {
  return isValidTimeZone(timeZone) ? (timeZone as string) : resolveViewerTimeZone();
}

function toDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Just the zone's label at that instant — "GST", "BST", "GMT+5:30". */
export function timeZoneLabel(
  value: Date | string | number,
  timeZone: string,
  locale = "en",
): string {
  const d = toDate(value);
  if (!d) return "";
  try {
    return (
      new Intl.DateTimeFormat(resolveIntlLocale(locale), { timeZone, timeZoneName: "short" })
        .formatToParts(d)
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * `dateStyle`/`timeStyle` are mutually exclusive with `timeZoneName` in
 * Intl.DateTimeFormat ("Invalid option : option"), so the stamp and its zone
 * label are formatted separately and joined.
 */
function withZoneLabel(d: Date, zone: string, locale: string, stamp: string): string {
  const label = timeZoneLabel(d, zone, locale);
  return label ? `${stamp} ${label}` : stamp;
}

/** "10:00 AM GST" — wall time in `timeZone`, with the zone named. */
export function formatZonedTime(
  value: Date | string | number,
  { timeZone, locale = "en", timeStyle = "short" }: ZoneFormatOptions = {},
): string {
  const d = toDate(value);
  if (!d) return "";
  const zone = safeZone(timeZone);
  const stamp = new Intl.DateTimeFormat(resolveIntlLocale(locale), { timeZone: zone, timeStyle }).format(d);
  return withZoneLabel(d, zone, locale, stamp);
}

/**
 * "10:00 AM – 10:30 AM GST" — a start/end pair in one zone.
 *
 * The label appears once, after the pair: both ends are in the same zone, so
 * repeating it reads as though they might not be.
 */
export function formatZonedTimeRange(
  start: Date | string | number,
  end: Date | string | number | null | undefined,
  { timeZone, locale = "en", timeStyle = "short" }: ZoneFormatOptions = {},
): string {
  const from = toDate(start);
  if (!from) return "";
  const zone = safeZone(timeZone);
  const fmt = new Intl.DateTimeFormat(resolveIntlLocale(locale), { timeZone: zone, timeStyle });

  const to = end === null || end === undefined ? null : toDate(end);
  const stamp = to ? `${fmt.format(from)} – ${fmt.format(to)}` : fmt.format(from);
  return withZoneLabel(from, zone, locale, stamp);
}

/** "21 Sep 2026, 10:00 AM GST" — full stamp in `timeZone`, with the zone named. */
export function formatZonedDateTime(
  value: Date | string | number,
  { timeZone, locale = "en", dateStyle = "medium", timeStyle = "short" }: ZoneFormatOptions = {},
): string {
  const d = toDate(value);
  if (!d) return "";
  const zone = safeZone(timeZone);
  const stamp = new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    timeZone: zone,
    dateStyle,
    timeStyle,
  }).format(d);
  return withZoneLabel(d, zone, locale, stamp);
}
