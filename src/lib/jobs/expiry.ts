/**
 * True once a job's closing date has gone by. The expiry cron flips such a job
 * to "expired" on its next run, so until then the status alone still reads
 * "active" — apply paths check this too. Listings use the same cut-off.
 */
export function isPastClosingDate(expiresAt?: Date | string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < now.getTime();
}

/**
 * Whole days until a job closes, or `null` when there is no expiry or it has
 * already passed — so callers can render "closes in N days" without a guard.
 */
export function closesInDays(expiresAt?: Date | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  return days > 0 ? days : null;
}
