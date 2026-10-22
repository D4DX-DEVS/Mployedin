"use client";

import { csrfFetch } from "@/lib/security/csrf-client";
import { readConsent } from "./client";
import { RECEIPT_ID_PATTERN } from "./receiptId";
import type { ConsentState } from "./state";

/**
 * A consent receipt that could not be delivered (server error, rate limit, no
 * network) is remembered for the tab and sent again on the next page loads, so
 * a database outage does not silently lose the record of a choice.
 *
 * The visitor's choice is the mpl_consent cookie, applied at once and never
 * waiting for any of this. The receipt is only the record of it.
 *
 * Why sessionStorage and not the cookie or localStorage:
 *   - mpl_consent is the choice itself: adding a "receipt pending" flag would
 *     mean rewriting it (and keeping its expiry), and every reader of the cookie
 *     (server and client) would have to learn the new field.
 *   - localStorage would survive for months on the device for a flag that is only
 *     useful for minutes; sessionStorage is cleared when the tab closes.
 *   - The marker holds a reference, a locale, a source and a counter: no body, no
 *     personal data. The body is rebuilt from the cookie at send time, so a stale
 *     or edited marker can never make the server log a choice the browser does
 *     not hold (and the route's 409 check stays in force).
 * Registered in lib/consent/registry.ts as strictly necessary (the record that
 * lets the controller demonstrate what was chosen, UK GDPR Art. 7(1)).
 */

/** sessionStorage key holding the one receipt still waiting to be delivered. */
export const RECEIPT_PENDING_KEY = "mpl_receipt_pending";
/** Attempts (page loads, or the browser coming back online) that re-send a pending receipt before it is given up. */
export const MAX_RESENDS = 3;
/**
 * How long to wait after a failed attempt before the next one: 30 s after the first, 2 min after the second,
 * 10 min after the third. A server that is down is not hammered by every page the visitor opens.
 */
export const RESEND_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000] as const;

export type ReceiptLocale = "en" | "ar";
export type ReceiptSource = "banner" | "settings";
/**
 * sent: stored. retry: the server was busy or failing (5xx, 429), worth trying again. offline: the request never
 * reached it. drop: the server would only repeat its refusal (4xx).
 */
export type ReceiptOutcome = "sent" | "retry" | "offline" | "drop";

export interface PendingReceipt {
  id: string;
  locale: ReceiptLocale;
  source: ReceiptSource;
  /** Re-sends already made (the first delivery in recordChoice does not count). */
  attempts: number;
  /** Not before this time (ms since epoch), unless the browser has just come back online. 0 = due now. */
  nextAt: number;
}

/** The receipt route's body, built from the choice cookie's own state. */
export function receiptBody(consent: ConsentState, locale: ReceiptLocale, source: ReceiptSource): string {
  return JSON.stringify({
    receiptId: consent.id,
    preferences: consent.preferences,
    media: consent.media,
    version: consent.v,
    locale,
    source,
  });
}

/** One attempt. Never throws. */
export async function postReceipt(body: string): Promise<ReceiptOutcome> {
  try {
    const res = await csrfFetch("/api/consent/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) return "sent";
    return res.status === 429 || res.status >= 500 ? "retry" : "drop";
  } catch {
    return "offline";
  }
}

export function readPendingReceipt(): PendingReceipt | null {
  try {
    const raw = window.sessionStorage.getItem(RECEIPT_PENDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { id, locale, source, attempts } = parsed as Record<string, unknown>;
    if (typeof id !== "string" || !RECEIPT_ID_PATTERN.test(id)) return null;
    if (locale !== "en" && locale !== "ar") return null;
    if (source !== "banner" && source !== "settings") return null;
    if (typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 0) return null;
    const due = (parsed as Record<string, unknown>).nextAt;
    return { id, locale, source, attempts, nextAt: typeof due === "number" && Number.isFinite(due) && due > 0 ? due : 0 };
  } catch {
    return null;
  }
}

function writePending(pending: PendingReceipt): void {
  try {
    window.sessionStorage.setItem(RECEIPT_PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Storage blocked: the choice still stands, the record is simply not retried.
  }
}

/** Forget the pending receipt; when `id` is given, only if the marker is for that reference (a newer choice's marker stays). */
export function clearPendingReceipt(id?: string): void {
  try {
    if (id !== undefined) {
      const pending = readPendingReceipt();
      if (pending && pending.id !== id) return;
    }
    window.sessionStorage.removeItem(RECEIPT_PENDING_KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * Remember that the receipt for choice `id` still has to be delivered. recordChoice writes it BEFORE the first
 * request and clears it once the receipt is stored, so a page that closes mid-request loses nothing (the route
 * stores a receipt once per reference, so a second delivery is harmless). Only for the choice currently in the
 * cookie: a failure that lands after a newer choice was made is for a choice no longer in force and is not kept.
 * `nextAt` holds the next try back until then.
 */
export function markReceiptPending(id: string, locale: ReceiptLocale, source: ReceiptSource, nextAt = 0): void {
  if (readConsent()?.id !== id) return;
  writePending({ id, locale, source, attempts: 0, nextAt });
}

/**
 * Called on every page load: send the pending receipt again, if there is one
 * and it still describes the choice in the cookie. Gives up (and forgets it)
 * when the consent id has changed, the cookie is gone, the attempts are used
 * up, or the server refuses it for good. Never throws.
 */
export function resendPendingReceipt(options: { ignoreSchedule?: boolean } = {}): Promise<void> {
  // One at a time: two mounts of the banner in one page load (React strict mode in development, say)
  // must not send the same receipt twice and use up two of its attempts.
  if (!resending) {
    resending = resendOnce(options.ignoreSchedule === true).finally(() => {
      resending = null;
    });
  }
  return resending;
}

let resending: Promise<void> | null = null;

async function resendOnce(ignoreSchedule: boolean): Promise<void> {
  const pending = readPendingReceipt();
  if (!pending) {
    // Nothing pending, or a value that is not a marker (edited by hand): forget it so it cannot linger.
    clearPendingReceipt();
    return;
  }

  const consent = readConsent();
  if (!consent || consent.id !== pending.id || pending.attempts >= MAX_RESENDS) {
    clearPendingReceipt();
    return;
  }

  // Not due yet (a failed attempt sets the next time): wait, unless the browser has just come back online.
  if (!ignoreSchedule && Date.now() < pending.nextAt) return;

  // Counted, and the next try pushed out, before the request, so a page that closes mid-request still uses up an attempt.
  const attempts = pending.attempts + 1;
  writePending({ ...pending, attempts, nextAt: Date.now() + RESEND_DELAYS_MS[Math.min(attempts, RESEND_DELAYS_MS.length) - 1] });
  const outcome = await postReceipt(receiptBody(consent, pending.locale, pending.source));
  if (outcome === "retry" || outcome === "offline") return;

  // sent or refused for good: forget it, unless a newer choice has put its own marker there meanwhile.
  if (readPendingReceipt()?.id === pending.id) clearPendingReceipt();
}
