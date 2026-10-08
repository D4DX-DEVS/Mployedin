"use client";

import { useSyncExternalStore } from "react";
import { getConsentSnapshot, subscribeConsent } from "@/lib/consent/client";
import { type ConsentCategory, type ConsentState, isCategoryAllowed } from "@/lib/consent/config";

const serverSnapshot = (): ConsentState | null => null;

/** Current consent state; `null` until the visitor has chosen (and on the server). */
export function useConsentState(): ConsentState | null {
  return useSyncExternalStore(subscribeConsent, getConsentSnapshot, serverSnapshot);
}

/** Whether a consent category is currently allowed. Always false during SSR. */
export function useConsent(category: ConsentCategory): boolean {
  return isCategoryAllowed(useConsentState(), category);
}
