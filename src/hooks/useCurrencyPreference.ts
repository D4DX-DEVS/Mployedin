"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "mployedin_display_currency";
const FALLBACK_CURRENCY = "AED";

/**
 * Persists the user's preferred display currency in localStorage.
 * Auto-initializes from the user's own country/currency setting
 * (per role: agent currencyCode, employer country, job-seeker nationality, etc.)
 * if the user hasn't explicitly chosen one yet.
 */
export function useCurrencyPreference() {
  const [currency, setCurrencyState] = useState<string>(FALLBACK_CURRENCY);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCurrencyState(saved);
        return;
      }
    } catch {
      // SSR or storage unavailable
    }

    // No saved preference — fetch user's own currency based on their role/country
    fetch("/api/user/currency")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.currencyCode) {
          setCurrencyState(data.currencyCode);
          try {
            localStorage.setItem(STORAGE_KEY, data.currencyCode);
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, []);

  const setCurrency = useCallback((code: string) => {
    setCurrencyState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }, []);

  return { displayCurrency: currency, setDisplayCurrency: setCurrency } as const;
}
