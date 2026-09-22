/**
 * Booking payload slots for the interview modal.
 *
 * The employer picks a day cell (a local-midnight Date) and a start time, then
 * one slot per selected candidate is staggered by the interview duration.
 *
 * Both halves must stay in the employer's own zone. Deriving the day with
 * `toISOString()` reads the date in UTC, which lands on the *previous* day for
 * every UTC+ zone — Dubai, Riyadh, Karachi, Kolkata — so a booking made for
 * the 21st was written to the 20th. Everything here works off the local
 * calendar fields instead, and lets Date roll the day over when a staggered
 * slot crosses midnight.
 */

import { localDateString } from "./availabilitySlots";

export interface BookingSlot {
  /** Calendar day in the employer's zone ("YYYY-MM-DD"). */
  date: string;
  /** Start time in the employer's zone ("HH:mm", 24h). */
  time: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * `count` consecutive slots starting at `time` on the day `picked` falls on,
 * each `duration` minutes after the last.
 */
export function bookingSlots(
  picked: Date,
  time: string,
  duration: number,
  count: number,
): BookingSlot[] {
  const [hour, minute] = time.split(":").map(Number);
  const slots: BookingSlot[] = [];

  for (let i = 0; i < count; i++) {
    // Local constructor + minute arithmetic, so the day rolls over on its own.
    const at = new Date(
      picked.getFullYear(),
      picked.getMonth(),
      picked.getDate(),
      hour,
      minute + i * duration,
    );
    slots.push({
      date: localDateString(at),
      time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    });
  }

  return slots;
}
