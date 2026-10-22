"use client";

import { useState, useEffect } from "react";
import { AED_EXCHANGE_RATES } from "@/lib/currency";

interface ExchangeRateResult {
  rates: Record<string, number>;
  source: "live" | "cache" | "fallback" | "static";
  isLoading: boolean;
}

// An older build kept the rates in localStorage. They are a data cache, not a
// preference, so they now live in memory only. The old copy is deleted on every
// page load by the cookie component (sweepLegacyDeviceCopies in lib/consent/legacyKeys),
// and is never read here.
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

interface StoredRates {
  rates: Record<string, number>;
  storedAt: number;
}

// Survives client-side navigation (the hook remounts; this module doesn't) and
// is gone on reload, so nothing is left on the device.
let memoryCache: StoredRates | null = null;

function readMemoryCache(): Record<string, number> | null {
  if (!memoryCache) return null;
  if (Date.now() - memoryCache.storedAt > CACHE_MAX_AGE_MS) return null;
  return memoryCache.rates;
}

function writeMemoryCache(rates: Record<string, number>) {
  memoryCache = { rates, storedAt: Date.now() };
}

/**
 * Fetches live exchange rates from /api/exchange-rates.
 * Keeps them in memory for the visit so later mounts are instant.
 * Falls back to the hardcoded AED_EXCHANGE_RATES if everything fails.
 */
export function useExchangeRates(): ExchangeRateResult {
  const [rates, setRates] = useState<Record<string, number>>(AED_EXCHANGE_RATES);
  const [source, setSource] = useState<ExchangeRateResult["source"]>("static");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Try the in-memory copy first for instant display
    const cached = readMemoryCache();
    if (cached) {
      setRates(cached);
      setSource("cache");
      setIsLoading(false);
    }

    // 2. Fetch fresh rates in background
    let cancelled = false;

    fetch("/api/exchange-rates")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { rates: Record<string, number>; source: string }) => {
        if (cancelled) return;
        if (data?.rates) {
          setRates(data.rates);
          setSource(data.source === "live" ? "live" : "cache");
          writeMemoryCache(data.rates);
        }
      })
      .catch(() => {
        // Keep whatever we have (cached or static fallback)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { rates, source, isLoading };
}
