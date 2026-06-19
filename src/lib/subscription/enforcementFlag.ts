/**
 * Global subscription-enforcement flag.
 *
 * Subscription billing/enforcement is controlled by a single platform setting
 * (`SystemSettings.subscriptionEnforcementEnabled`). While it is OFF (default),
 * all users get full access and no plan limits / feature gates are applied.
 * Once payment integration is live, an admin flips it ON from the
 * admin → subscription-plans page and the gating logic takes effect.
 *
 * The value is cached in-process for a short TTL to avoid a DB read on every
 * gated request. Concurrent cold reads are coalesced onto a single in-flight
 * query (no thundering-herd stampede under high load).
 * `clearSubscriptionEnforcementCache()` is called when the setting is updated
 * so changes take effect immediately.
 */
import connectDB from "@/lib/db/mongoose";
import SystemSettings from "@/models/SystemSettings";

const CACHE_TTL_MS = 60_000;

let cachedValue: boolean | null = null;
let cachedAt = 0;
let inflight: Promise<boolean> | null = null;

async function loadFromDb(): Promise<boolean> {
  try {
    await connectDB();
    const settings = await SystemSettings.findOne()
      .select("subscriptionEnforcementEnabled")
      .lean<{ subscriptionEnforcementEnabled?: boolean }>();
    cachedValue = settings?.subscriptionEnforcementEnabled ?? false;
  } catch {
    // On any error, fail open (no enforcement) so the platform stays usable.
    cachedValue = false;
  }
  cachedAt = Date.now();
  return cachedValue;
}

/** Returns whether subscription enforcement is currently enabled (cached). */
export async function isSubscriptionEnforcementEnabled(): Promise<boolean> {
  if (cachedValue !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedValue;
  }

  // Coalesce concurrent cold reads onto one DB query so a burst of requests
  // (e.g. thousands hitting a freshly-started instance) triggers a single read.
  if (!inflight) {
    inflight = loadFromDb().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Invalidate the cached flag (call after the setting is updated). */
export function clearSubscriptionEnforcementCache(): void {
  cachedValue = null;
  cachedAt = 0;
  inflight = null;
}
