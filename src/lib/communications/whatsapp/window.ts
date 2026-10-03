/** Meta's customer-service window: free-form messages only within 24 h of the user's last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinServiceWindow(lastInboundAt?: Date | string | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < SERVICE_WINDOW_MS;
}
