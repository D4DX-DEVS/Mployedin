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
