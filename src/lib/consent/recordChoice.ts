"use client";

import { readConsent, withdrawCleanup, writeConsent } from "./client";
import {
  RESEND_DELAYS_MS,
  clearPendingReceipt,
  markReceiptPending,
  postReceipt,
  receiptBody,
  type ReceiptLocale,
  type ReceiptSource,
} from "./pendingReceipt";
import type { ConsentState } from "./state";

/**
 * Where a choice was made. The receipt route stores two of these ("banner",
 * "settings"); a choice made by ticking "Always play videos" on a video
 * placeholder is reported as "settings", because it changes a Cookie setting
 * (Videos on) and the route's log has no better word for it.
 */
export type ChoiceSource = "banner" | "settings" | "facade";

const RECEIPT_SOURCE: Record<ChoiceSource, ReceiptSource> = {
  banner: "banner",
  settings: "settings",
  facade: "settings",
};

/** Long enough to ride out a brief rate-limit or server hiccup, short enough that the tab is usually still open. */
const RECEIPT_RETRY_DELAY_MS = 2000;

/**
 * Send the receipt for a stored choice, fire-and-forget: it never blocks the
 * caller. A 429 or 5xx is tried once more after a short wait; a 4xx the server
 * would only repeat is not, and neither is a request that never left the device
 * (a second try a moment later would meet the same network). The timer is
 * deliberately not tied to a component: the choice is already stored, so the
 * receipt must still go if the visitor navigates away.
 *
 * The receipt is remembered for the tab (pendingReceipt) BEFORE the first request
 * and forgotten once the server has answered for good (stored, or a refusal a
 * resend would only repeat), so a page that closes mid-request, or a receipt
 * that keeps failing (5xx, 429, no network), is sent again on a later page load
 * or when the browser comes back online. That is safe because the route stores
 * one receipt per choice reference. The choice itself is the cookie and is never
 * affected. Never throws.
 */
async function deliverReceipt(consent: ConsentState, locale: ReceiptLocale, source: ReceiptSource): Promise<void> {
  const body = receiptBody(consent, locale, source);
  let outcome = await postReceipt(body);
  if (outcome === "retry") {
    await new Promise<void>((resolve) => setTimeout(resolve, RECEIPT_RETRY_DELAY_MS));
    outcome = await postReceipt(body);
  }
  if (outcome === "sent" || outcome === "drop") {
    clearPendingReceipt(consent.id); // not a newer choice's marker
  } else {
    // Still failing: hold the next try back (the marker was written before the first request).
    markReceiptPending(consent.id, locale, source, Date.now() + RESEND_DELAYS_MS[0]);
  }
}

/**
 * Record a cookie choice: store it in `mpl_consent` (which tells every listener,
 * CONSENT_EVENT), clear preference storage when Preferences was withdrawn, then
 * send the receipt without waiting for it. A signed-in user's account log is
 * written by the receipt route; a visitor's reaches the log when they register
 * (cookieChoice adapter).
 *
 * The one path every choice takes, so a choice made on the banner, in the Cookie
 * settings dialog or on a video placeholder leaves the same trail.
 *
 * Never throws and never rejects: it is called as `void recordConsentChoice(...)`.
 * The choice cookie is written first, so if the cleanup fails (blocked storage)
 * the choice still stands and the receipt is still sent. Returns the stored
 * choice, or null when it could not be stored (cookies blocked): then there is
 * no cookie and no receipt, nothing optional runs, and the visitor is asked
 * again next time.
 */
export async function recordConsentChoice(
  p: { preferences: boolean; media: boolean },
  opts: { locale: string; source: ChoiceSource },
): Promise<ConsentState | null> {
  let next: ConsentState | null = null;
  try {
    const prev = readConsent();
    next = writeConsent(p);
    try {
      await withdrawCleanup(prev, next);
    } catch {
      // Clearing stored preferences is best effort; the choice itself stands.
    }
    const locale = opts.locale === "ar" ? "ar" : "en";
    // Remembered before anything is sent; this also replaces the marker of an older choice.
    markReceiptPending(next.id, locale, RECEIPT_SOURCE[opts.source]);
    void deliverReceipt(next, locale, RECEIPT_SOURCE[opts.source]).catch(() => undefined);
  } catch {
    // writeConsent threw (next is still null), or sending the receipt threw
    // after the choice was stored (next stands).
  }
  return next;
}
