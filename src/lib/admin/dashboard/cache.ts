import { smartCache } from "@/lib/cache/smartCache";

/**
 * Cross-request cache for the admin dashboard's expensive aggregates.
 *
 * Within one render the sections already share queries via React `cache()`
 * (see `shared.server.ts`); this layer covers repeat visits. The reporting
 * window drifts with `now`, so keying by period key intentionally freezes the
 * numbers for one TTL — stable figures while the page is open.
 *
 * The action queue is deliberately NOT cached (see `sections.tsx`): stale
 * "needs action" counts are worse than a slower load.
 *
 * Single-instance note: `smartCache` is a per-process map. If the app ever
 * runs on multiple Node instances, swap this wrapper for `redisCache` —
 * the call sites stay the same.
 */

export const ADMIN_DASHBOARD_CACHE_PREFIX = "admin-dash:";

/** Matched to how fast the underlying figures move; the Refresh button bypasses it. */
export const ADMIN_DASHBOARD_SECTION_TTL = 60;

/** Pure key builder, unit-tested. Permission-varying inputs must be part of `key`. */
export function dashboardSectionKey(section: string, key: string): string {
  return `${ADMIN_DASHBOARD_CACHE_PREFIX}${section}:${key}`;
}

export function cachedDashboardSection<T>(section: string, key: string, fetcher: () => Promise<T>): Promise<T> {
  // Jest isolation: the dashboard tests mock the query functions per test and
  // assert per-permission behaviour, so a shared map would leak between them.
  if (process.env.NODE_ENV === "test") return fetcher();
  return smartCache(dashboardSectionKey(section, key), fetcher, { ttl: ADMIN_DASHBOARD_SECTION_TTL, tags: ["admin-dashboard"] });
}
