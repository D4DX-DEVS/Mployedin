/**
 * Candidate self-scheduling slots, as served by
 * GET /api/job-seekers/[id]/availability?date=YYYY-MM-DD&range=7.
 *
 * The API speaks in the candidate's own time zone ("10:00" in Asia/Dubai);
 * the employer's picker speaks in the browser's zone. Everything here is the
 * translation between the two, kept pure so it can be tested without a DOM.
 */

export interface AvailabilitySlot {
  start: string;
  end: string;
}

export interface AvailabilityDay {
  date: string;
  dayName: string;
  timezone: string;
  slots: AvailabilitySlot[];
}

export interface AvailabilityResponse {
  seekerId: string;
  timezone: string;
  timeBuffer: number;
  availability: AvailabilityDay[];
}

export interface FreeSlot {
  /** Candidate-zone date ("YYYY-MM-DD") and start ("HH:mm"), as the API sent them. */
  date: string;
  start: string;
  /** The same moment as an instant, so it can be shown or set in any zone. */
  at: Date;
}

export const AVAILABILITY_RANGE_DAYS = 7;

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a Date in the viewer's zone. */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** datetime-local input value ("YYYY-MM-DDTHH:mm") of an instant in the viewer's zone. */
export function toDateTimeLocal(d: Date): string {
  return `${localDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The day the slot window starts from: the picked day (ISO or datetime-local) if there is one, else today. */
export function availabilityWindowStart(scheduledAt: string, now: Date = new Date()): string {
  const picked = scheduledAt ? new Date(scheduledAt) : null;
  return picked && !Number.isNaN(picked.getTime()) ? localDateString(picked) : localDateString(now);
}

export function availabilityUrl(seekerId: string, date: string, range: number = AVAILABILITY_RANGE_DAYS): string {
  return `/api/job-seekers/${encodeURIComponent(seekerId)}/availability?date=${date}&range=${range}`;
}

/** Offset of `timeZone` from UTC at `instant`, in ms (Asia/Dubai → +4h). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return wallAsUtc - instant.getTime();
}

/** Wall-clock `date` + `hhmm` in `timeZone` → the instant it names. */
export function zonedToDate(date: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // First pass with the offset near the guess, second pass with the offset at
  // the answer, so a DST change between the two does not shift the result.
  const firstGuess = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), timeZone);
  return new Date(wallAsUtc - zoneOffsetMs(new Date(firstGuess), timeZone));
}

/** The first `max` free slots across the window that are still in the future. */
export function firstFreeSlots(days: AvailabilityDay[], max = 12, now: Date = new Date()): FreeSlot[] {
  const out: FreeSlot[] = [];
  for (const day of days) {
    for (const slot of day.slots) {
      const at = zonedToDate(day.date, slot.start, day.timezone);
      if (at.getTime() < now.getTime()) continue;
      out.push({ date: day.date, start: slot.start, at });
      if (out.length >= max) return out;
    }
  }
  return out;
}
