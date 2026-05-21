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
  const [hasStoredPreference, setHasStoredPreference] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCurrencyState(saved);
        setHasStoredPreference(true);
      }
    } catch {
      // SSR or storage unavailable
    } finally {
      setIsReady(true);
    }
  }, []);

  const setCurrency = useCallback((code: string) => {
    const normalized = code.toUpperCase();
    setCurrencyState(normalized);
    setHasStoredPreference(true);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // ignore
    }
  }, []);

  const initializeDisplayCurrency = useCallback((code: string) => {
    if (!isReady || hasStoredPreference || !code) {
      return;
    }

    const normalized = code.toUpperCase();
    setCurrencyState(normalized);
    setHasStoredPreference(true);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // ignore
    }
  }, [hasStoredPreference, isReady]);

  return {
    displayCurrency: currency,
    setDisplayCurrency: setCurrency,
    initializeDisplayCurrency,
    isCurrencyPreferenceReady: isReady,
  } as const;
}
