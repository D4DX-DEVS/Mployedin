"use client";

import { deleteIndexedDb } from "@/lib/browser/indexedDb";
import { deleteLegacyRuntimeCaches } from "@/lib/pwa/serviceWorkerCleanup";
import { csrfFetch } from "@/lib/security/csrf-client";
import { clearPendingReferral } from "@/lib/referrals/pendingReferral";
import { forgetSignupConsent } from "@/lib/auth/signupConsent";
import {
  JOB_DRAFT_PREFIX,
  LEGACY_RECENT_PAGES_PREFIX,
  POSTER_EDIT_PREFIX,
  TEMP_PASSWORD_NOTICE_PREFIX,
  markSignOutStarted,
  removeStorageKeys,
} from "./deviceStorage";

/** Tab-scoped keys that hold a signed-in person's work in progress. */
const TAB_KEYS = [
  "job-ai-prefill",
  "job-ai-extract-snapshot",
  "job-ai-chat-session",
  "job-prefs-draft",
  "employer-candidate-matching-session-v1",
  "copilot-chats",
];
const TAB_PREFIXES = [JOB_DRAFT_PREFIX, POSTER_EDIT_PREFIX, TEMP_PASSWORD_NOTICE_PREFIX, "ai-thread-", "ai_insights_"];

/** localStorage keys: the idle tracker, plus copies older builds left on the device. */
const LOCAL_KEYS = ["mployedin_last_activity", "copilot-chats"];
const LOCAL_PREFIXES = [LEGACY_RECENT_PAGES_PREFIX, JOB_DRAFT_PREFIX];

/** Firebase Auth keeps the Google user and refresh token in these. */
const FIREBASE_DATABASES = ["firebaseLocalStorageDb", "firebase-heartbeat-database"];

/**
 * Sign-out must not wait on a stuck push service or a blocked database. Past
 * this the cleanup returns and the sign-out carries on; the storage wipe has
 * already happened by then.
 */
const SLOW_STEPS_TIMEOUT_MS = 2500;

const startsWithAny = (key: string, prefixes: string[]) => prefixes.some((prefix) => key.startsWith(prefix));

function clearStorage(): void {
  try {
    removeStorageKeys(sessionStorage, (key) => TAB_KEYS.includes(key) || startsWithAny(key, TAB_PREFIXES));
  } catch {
    // sessionStorage unavailable
  }
  try {
    removeStorageKeys(localStorage, (key) => LOCAL_KEYS.includes(key) || startsWithAny(key, LOCAL_PREFIXES));
  } catch {
    // localStorage unavailable
  }
}

/**
 * Stops pushes reaching this browser for the person signing out. The server row
 * goes first (it needs the session cookie, so this must run before sign-out);
 * the browser subscription is dropped either way, so the next person on the
 * device cannot receive the previous user's notifications.
 */
async function removePushSubscription(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    try {
      await csrfFetch("/api/push/subscription", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch {
      // offline or session already gone — the browser side below still matters
    }
    await subscription.unsubscribe();
  } catch {
    // no service worker, or push unsupported
  }
}

/**
 * Authenticated API replies carry `Cache-Control: private, max-age=...`, so the
 * browser HTTP cache would hand the previous user's lists to the next person
 * (offline, or from a back navigation). This route answers with
 * `Clear-Site-Data: "cache"`, which empties it. Best effort: offline or an
 * unsupported browser (Safari ignores the header) must never block sign-out.
 */
async function clearBrowserHttpCache(): Promise<void> {
  try {
    await csrfFetch("/api/session/clear-cache", { method: "POST" });
  } catch {
    // offline — nothing more to do from here
  }
}

/**
 * Clears what a signed-in person leaves on the device. Call it BEFORE
 * `signOut()`: removing the push subscription needs the session. Never rejects.
 */
export async function logoutCleanup(): Promise<void> {
  // Tell autosavers to stop writing, then wipe. A save landing after the wipe
  // would put the previous user's draft or chat back on the device.
  markSignOutStarted();
  // Synchronous work first, so nothing slow below can stop it.
  clearStorage();
  // A referral code held in page memory belongs to the visit that just ended.
  clearPendingReferral();
  // So does a Terms tick (with its referral code) kept for a LinkedIn / Apple sign-in.
  forgetSignupConsent();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SLOW_STEPS_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      // The legacy caches held API replies, pages and photos from this session; a
      // device whose service worker has not updated yet would still have them.
      Promise.all([
        removePushSubscription(),
        clearBrowserHttpCache(),
        deleteLegacyRuntimeCaches(),
        ...FIREBASE_DATABASES.map(deleteIndexedDb),
      ]),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
