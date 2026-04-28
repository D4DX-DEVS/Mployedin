/**
 * Smart in-memory cache with TTL, LRU eviction, and tag-based invalidation.
 *
 * Usage (server-side):
 *   const data = await smartCache("dashboard:user123", () => fetchData(), { ttl: 60 });
 *
 * Invalidation:
 *   invalidateCache("dashboard:user123");    // by key
 *   invalidateCacheByTag("user:123");        // by tag
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}

interface SmartCacheOptions {
  /** Time-to-live in seconds. Default: 60 */
  ttl?: number;
  /** Tags for group invalidation (e.g., ["user:123", "dashboard"]) */
  tags?: string[];
  /** Force refresh even if cached. Default: false */
  forceRefresh?: boolean;
}

const DEFAULT_TTL = 60;
const MAX_ENTRIES = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, CacheEntry<any>>();
// Track insertion order for LRU eviction
const accessOrder: string[] = [];

function touchKey(key: string): void {
  const idx = accessOrder.indexOf(key);
  if (idx !== -1) accessOrder.splice(idx, 1);
  accessOrder.push(key);
}

function evictIfNeeded(): void {
  while (cache.size > MAX_ENTRIES) {
    const oldest = accessOrder.shift();
    if (oldest) cache.delete(oldest);
  }
}

/**
 * Get-or-set cache with automatic TTL and LRU eviction.
 */
export async function smartCache<T>(
  key: string,
  fetcher: () => T | Promise<T>,
  options: SmartCacheOptions = {}
): Promise<T> {
  const { ttl = DEFAULT_TTL, tags = [], forceRefresh = false } = options;

  // Check for fresh cache hit
  if (!forceRefresh) {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      touchKey(key);
      return entry.value as T;
    }
  }

  // Cache miss or stale — fetch fresh data
  const value = await fetcher();

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl * 1000,
    tags,
  });
  touchKey(key);
  evictIfNeeded();

  return value;
}

/** Remove a single key from cache. */
export function invalidateCache(key: string): void {
  cache.delete(key);
  const idx = accessOrder.indexOf(key);
  if (idx !== -1) accessOrder.splice(idx, 1);
}

/** Remove all cache entries that have a specific tag. */
export function invalidateCacheByTag(tag: string): void {
  const keysToDelete: string[] = [];
  for (const [key, entry] of cache) {
    if (entry.tags.includes(tag)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    invalidateCache(key);
  }
}

/** Remove all cache entries matching a key prefix. */
export function invalidateCacheByPrefix(prefix: string): void {
  const keysToDelete: string[] = [];
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    invalidateCache(key);
  }
}

/** Get cache stats for debugging. */
export function getCacheStats(): { size: number; maxEntries: number } {
  return { size: cache.size, maxEntries: MAX_ENTRIES };
}

/**
 * Build Cache-Control headers based on data sensitivity.
 *
 * @param type - "private" for user-specific, "public" for shared, "none" for no-cache
 * @param ttl  - max-age in seconds
 */
export function cacheHeaders(
  type: "private" | "public" | "none",
  ttl = 60
): Record<string, string> {
  switch (type) {
    case "private":
      return {
        "Cache-Control": `private, max-age=${ttl}, stale-while-revalidate=${ttl * 2}`,
      };
    case "public":
      return {
        "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
      };
    case "none":
      return {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      };
  }
}
