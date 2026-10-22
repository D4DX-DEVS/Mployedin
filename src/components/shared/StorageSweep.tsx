"use client";

import { useEffect } from "react";
import { deleteIndexedDb } from "@/lib/browser/indexedDb";
import { FIREBASE_DATABASES, isFirebaseActive } from "@/lib/firebase/state";

/** One sweep per full page load, however many layouts mount this on the way. */
let swept = false;

/**
 * Removes Firebase's IndexedDB databases once per full page load.
 *
 * Firebase only runs after a "Continue with Google" click and keeps nothing,
 * but two kinds of leftover can still be on a device: the persisted user the
 * old code kept for visitors who signed in with Google, and the library's
 * heartbeat database, which a browser cannot delete while the page that opened
 * it is alive (WebKit drops that delete when the page goes). A new page has no
 * such connection, so this deletes them.
 *
 * It skips the sweep if a Firebase instance is already alive in this page (a
 * click before this ran): that instance's own dispose and `pagehide` clean-up
 * handle its databases. It reads that from `lib/firebase/state` and imports
 * nothing else of Firebase's, so mounting it everywhere starts nothing.
 */
export default function StorageSweep(): null {
  useEffect(() => {
    if (swept) return;
    swept = true;
    if (isFirebaseActive()) return;
    for (const name of FIREBASE_DATABASES) void deleteIndexedDb(name);
  }, []);

  return null;
}
