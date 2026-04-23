"use client";

import { useState, useEffect } from "react";
import { AED_EXCHANGE_RATES } from "@/lib/currency";

interface ExchangeRateResult {
  rates: Record<string, number>;
  source: "live" | "cache" | "fallback" | "static";
  isLoading: boolean;
}

const CACHE_KEY = "mployedin_exchange_rates";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

interface StoredRates {
  rates: Record<string, number>;
  storedAt: number;
}

function readLocalCache(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: StoredRates = JSON.parse(raw);
    if (Date.now() - parsed.storedAt > CACHE_MAX_AGE_MS) return null;
    return parsed.rates;
  } catch {
    return null;
  }
}

function writeLocalCache(rates: Record<string, number>) {
  try {
    const entry: StoredRates = { rates, storedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

/**
 * Fetches live exchange rates from /api/exchange-rates.
 * Uses localStorage as a secondary cache so repeated page loads are instant.
 * Falls back to the hardcoded AED_EXCHANGE_RATES if everything fails.
 */
export function useExchangeRates(): ExchangeRateResult {
  const [rates, setRates] = useState<Record<string, number>>(AED_EXCHANGE_RATES);
  const [source, setSource] = useState<ExchangeRateResult["source"]>("static");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Try localStorage cache first for instant display
    const cached = readLocalCache();
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
          writeLocalCache(data.rates);
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
