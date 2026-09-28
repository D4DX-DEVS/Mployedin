"use server";

import { auth } from "@/lib/auth/config";
import { ADMIN_DASHBOARD_CACHE_PREFIX } from "@/lib/admin/dashboard/cache";
import { invalidateCacheByPrefix } from "@/lib/cache/smartCache";

/**
 * Refresh must mean fresh: drop the dashboard aggregates so the following
 * `router.refresh()` re-queries instead of hitting the warm 60s cache.
 * Session-checked — a forged call could otherwise force recompute loops.
 */
export async function invalidateAdminDashboardCache(): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  invalidateCacheByPrefix(ADMIN_DASHBOARD_CACHE_PREFIX);
}
