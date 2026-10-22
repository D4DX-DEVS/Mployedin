"use client";

import { useState, useCallback, useEffect } from "react";
import { prefStorage } from "@/lib/consent/prefStorage";

const STORAGE_KEY = "mployedin_display_currency";
const FALLBACK_CURRENCY = "AED";

/**
 * Remembers the user's preferred display currency on the device (localStorage)
 * while preferences are allowed, and for the tab only (sessionStorage) once
 * the visitor has objected to them — see prefStorage.
 * Auto-initializes from the user's own country/currency setting
 * (per role: agent currencyCode, employer country, job-seeker nationality, etc.)
 * if the user hasn't explicitly chosen one yet.
 */
export function useCurrencyPreference() {
  const [currency, setCurrencyState] = useState<string>(FALLBACK_CURRENCY);

  useEffect(() => {
    // prefStorage never throws (SSR or storage unavailable reads as "nothing saved")
    const saved = prefStorage.get(STORAGE_KEY);
    if (saved) {
      setCurrencyState(saved);
      return;
    }

    // No saved preference — fetch user's own currency based on their role/country
    fetch("/api/user/currency")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.currencyCode) {
          setCurrencyState(data.currencyCode);
          prefStorage.set(STORAGE_KEY, data.currencyCode);
        }
      })
      .catch(() => {});
  }, []);

  const setCurrency = useCallback((code: string) => {
    setCurrencyState(code);
    prefStorage.set(STORAGE_KEY, code);
  }, []);

  return { displayCurrency: currency, setDisplayCurrency: setCurrency } as const;
}
