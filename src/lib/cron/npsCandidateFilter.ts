export const TERMINAL_STATUSES = ["hired", "rejected", "withdrawn"];

/**
 * Applications whose terminal status was ENTERED inside the window. Keyed on
 * `updatedAt` it re-picked every application touched for any reason (a note,
 * a re-score), so about 20 old outcomes fired at once (JS-09). `updatedAt`
 * stays as a cheap lower bound: the status change itself updated it.
 */
export function npsCandidateFilter(windowStart: Date, windowEnd: Date) {
  return {
    status: { $in: TERMINAL_STATUSES },
    updatedAt: { $gte: windowStart },
    statusHistory: {
      $elemMatch: { status: { $in: TERMINAL_STATUSES }, changedAt: { $gte: windowStart, $lte: windowEnd } },
    },
  };
}
