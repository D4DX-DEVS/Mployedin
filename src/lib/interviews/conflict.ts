/**
 * Double-booking detection for interview scheduling.
 *
 * Two things this fixes about the guard it replaces:
 *
 * 1. It compares *intervals*, not start points. The old query asked whether an
 *    existing interview's `scheduledAt` fell inside the new slot's window, so a
 *    long interview already under way was missed — existing 09:00 for 120 min
 *    against a new 10:30 booking is plainly a clash, but 09:00 sits outside
 *    [10:00, 11:00).
 *
 * 2. It is applied unconditionally. The old one lived inside
 *    `if (settings.instantBooking)`, so a candidate who turned instant booking
 *    *off* lost double-booking protection altogether.
 *
 * The comparison is done in JS rather than in the query because expressing
 * "existing.scheduledAt + existing.duration > newStart" in MongoDB needs
 * `$expr`, which is harder to read and impossible to unit test. `conflictWindow`
 * keeps the candidate set small enough that the difference does not matter.
 */

/** Longest interview we will look back for. Anything longer is out of scope. */
export const MAX_INTERVIEW_MINUTES = 480;

/** Used when a stored interview has no duration recorded. */
export const DEFAULT_INTERVIEW_MINUTES = 30;

export interface ExistingInterview {
  scheduledAt: Date | string;
  duration?: number;
}

const MINUTE = 60_000;

function startOf(row: ExistingInterview): number | null {
  const d = row.scheduledAt instanceof Date ? row.scheduledAt : new Date(row.scheduledAt);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * The `scheduledAt` range to load candidates from.
 *
 * Reaches back a whole `MAX_INTERVIEW_MINUTES` past the window start so that an
 * interview which began earlier but is still running is included in the rows
 * `findOverlap` then checks precisely.
 */
export function conflictWindow(
  newStart: Date,
  newDurationMinutes: number,
  bufferMinutes: number,
): { from: Date; to: Date } {
  const start = newStart.getTime() - bufferMinutes * MINUTE;
  const end = newStart.getTime() + (newDurationMinutes + bufferMinutes) * MINUTE;
  return {
    from: new Date(start - MAX_INTERVIEW_MINUTES * MINUTE),
    to: new Date(end),
  };
}

/**
 * The first interview in `existing` that overlaps the proposed slot, or null.
 *
 * The buffer widens the proposed slot on both sides, so with a buffer set a
 * back-to-back booking counts as a clash; with no buffer it does not.
 */
export function findOverlap(
  newStart: Date,
  newDurationMinutes: number,
  bufferMinutes: number,
  existing: readonly ExistingInterview[],
): ExistingInterview | null {
  const from = newStart.getTime() - bufferMinutes * MINUTE;
  const to = newStart.getTime() + (newDurationMinutes + bufferMinutes) * MINUTE;

  for (const row of existing) {
    const rowStart = startOf(row);
    if (rowStart === null) continue;
    const rowEnd = rowStart + (row.duration ?? DEFAULT_INTERVIEW_MINUTES) * MINUTE;
    // Half-open intervals: touching ends do not overlap.
    if (rowStart < to && rowEnd > from) return row;
  }

  return null;
}
