import { NextResponse } from "next/server";

/**
 * GET /api/exchange-rates
 *
 * Fetches live exchange rates with AED as base currency from the
 * free Open Exchange Rate API (open.er-api.com — no API key needed).
 *
 * Caches in-memory for 12 hours so we don't hammer the upstream API.
 * Falls back to hardcoded rates if the upstream call fails.
 */

// ── In-memory cache ──────────────────────────────────────────────────────────

interface RateCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
let cache: RateCache | null = null;

// ── Hardcoded fallback (same as previous static rates) ───────────────────────

const FALLBACK_RATES: Record<string, number> = {
  AED: 1,
  USD: 0.2723,
  INR: 22.78,
  GBP: 0.2158,
  SAR: 1.0209,
  QAR: 0.9914,
  KWD: 0.0836,
  BHD: 0.1026,
  OMR: 0.1048,
  EGP: 13.63,
  PKR: 75.83,
  BDT: 32.59,
  PHP: 15.32,
  CAD: 0.3753,
  AUD: 0.4179,
  EUR: 0.2514,
  JPY: 38.86,
  SGD: 0.3598,
  MYR: 1.1796,
  JOD: 0.1929,
  LBP: 24384,
  NGN: 422.0,
  ZAR: 4.9,
  KES: 35.2,
};

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  // Return cached if still fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      rates: cache.rates,
      source: "cache",
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch("https://open.er-api.com/v6/latest/AED", {
      signal: controller.signal,
      next: { revalidate: CACHE_TTL_MS / 1000 },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Upstream ${res.status}`);

    const data = await res.json();

    if (data?.result !== "success" || !data.rates) {
      throw new Error("Unexpected response shape");
    }

    // The API returns rates for many currencies; filter to ones we support
    const rates: Record<string, number> = { AED: 1 };
    for (const code of Object.keys(FALLBACK_RATES)) {
      if (data.rates[code] != null) {
        rates[code] = data.rates[code];
      } else {
        rates[code] = FALLBACK_RATES[code];
      }
    }

    cache = { rates, fetchedAt: Date.now() };

    return NextResponse.json({
      rates,
      source: "live",
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
    });
  } catch {
    // Fallback to hardcoded rates
    return NextResponse.json({
      rates: cache?.rates ?? FALLBACK_RATES,
      source: "fallback",
      fetchedAt: cache
        ? new Date(cache.fetchedAt).toISOString()
        : null,
    });
  }
}
