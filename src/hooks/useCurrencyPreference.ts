"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "mployedin_display_currency";
const DEFAULT_CURRENCY = "AED";

/**
 * Persists the user's preferred display currency in localStorage.
 * Falls back to AED if nothing is saved.
 */
export function useCurrencyPreference() {
  const [currency, setCurrencyState] = useState<string>(DEFAULT_CURRENCY);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCurrencyState(saved);
    } catch {
      // SSR or storage unavailable
    }
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
