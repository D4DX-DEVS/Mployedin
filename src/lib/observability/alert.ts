/**
 * Optional error alerts. Set ERROR_ALERT_WEBHOOK_URL to a Slack-compatible
 * incoming webhook (anything that accepts `{ "text": "..." }`) and server errors
 * plus browser crashes post there. Unset, this does nothing and the structured
 * log line is the only record.
 *
 * Throttled per error signature so one failing route can't flood the channel,
 * and capped overall because /api/client-errors is public: its text (and so its
 * signature) is whatever the caller sends.
 */
const THROTTLE_MS = 60_000;
const MAX_ALERTS_PER_MINUTE = 10;
const lastSent = new Map<string, number>();
let sentThisWindow: number[] = [];

/** Slack reads <...> as mentions/links; escaped, reported text can't @channel. */
const escapeSlack = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendErrorAlert(signature: string, text: string): Promise<void> {
  const url = process.env.ERROR_ALERT_WEBHOOK_URL;
  if (!url) return;

  const now = Date.now();
  const previous = lastSent.get(signature);
  if (previous !== undefined && now - previous < THROTTLE_MS) return;
  sentThisWindow = sentThisWindow.filter((t) => now - t < THROTTLE_MS);
  if (sentThisWindow.length >= MAX_ALERTS_PER_MINUTE) return;
  sentThisWindow.push(now);
  lastSent.set(signature, now);
  if (lastSent.size > 1000) lastSent.clear();

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: escapeSlack(text.slice(0, 3000)) }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* alerting must never break the request that failed */
  }
}
