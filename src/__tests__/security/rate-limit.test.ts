/**
 * @jest-environment node
 */
import {
  checkRateLimit,
  RATE_LIMIT_CONFIGS,
  type RateLimitConfig,
} from "@/lib/security/rateLimit";

describe("checkRateLimit", () => {
  const testConfig: RateLimitConfig = {
    limit: 3,
    windowSec: 60,
    prefix: "test",
  };

  // Use unique keys per test to avoid cross-test pollution
  const uniqueKey = () => `user-${Date.now()}-${Math.random()}`;

  test("allows requests within limit", async () => {
    const key = uniqueKey();
    const r1 = await checkRateLimit(key, testConfig);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
  });

  test("counts requests correctly and decrements remaining", async () => {
    const key = uniqueKey();
    await checkRateLimit(key, testConfig); // 1
    const r2 = await checkRateLimit(key, testConfig); // 2
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
  });

  test("blocks after exceeding limit", async () => {
    const key = uniqueKey();
    await checkRateLimit(key, testConfig); // 1
    await checkRateLimit(key, testConfig); // 2
    await checkRateLimit(key, testConfig); // 3 (last allowed)
    const r4 = await checkRateLimit(key, testConfig); // 4 (blocked)
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  test("allows exactly 'limit' requests", async () => {
    const key = uniqueKey();
    for (let i = 0; i < testConfig.limit; i++) {
      expect((await checkRateLimit(key, testConfig)).allowed).toBe(true);
    }
    expect((await checkRateLimit(key, testConfig)).allowed).toBe(false);
  });

  test("different keys are isolated", async () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();

    // Exhaust key1
    for (let i = 0; i <= testConfig.limit; i++) {
      await checkRateLimit(key1, testConfig);
    }
    expect((await checkRateLimit(key1, testConfig)).allowed).toBe(false);

    // key2 should still be allowed
    expect((await checkRateLimit(key2, testConfig)).allowed).toBe(true);
  });

  test("different prefixes create separate namespaces", async () => {
    const key = uniqueKey();
    const configA: RateLimitConfig = { limit: 1, windowSec: 60, prefix: "ns-a" };
    const configB: RateLimitConfig = { limit: 1, windowSec: 60, prefix: "ns-b" };

    await checkRateLimit(key, configA); // 1st for ns-a
    expect((await checkRateLimit(key, configA)).allowed).toBe(false); // 2nd — blocked

    // ns-b should still allow
    expect((await checkRateLimit(key, configB)).allowed).toBe(true);
  });

  test("returns resetAt timestamp in the future", async () => {
    const key = uniqueKey();
    const result = await checkRateLimit(key, testConfig);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  test("remaining never goes below 0", async () => {
    const key = uniqueKey();
    for (let i = 0; i < testConfig.limit + 5; i++) {
      await checkRateLimit(key, testConfig);
    }
    const result = await checkRateLimit(key, testConfig);
    expect(result.remaining).toBe(0);
  });

  test("uses default api config when none provided", async () => {
    const key = uniqueKey();
    const result = await checkRateLimit(key);
    expect(result.allowed).toBe(true);
    // Default api config has limit=100, so remaining should be 99
    expect(result.remaining).toBe(RATE_LIMIT_CONFIGS.api.limit - 1);
  });

  test("window resets after expiry", async () => {
    const key = uniqueKey();
    // windowSec:0 means each entry expires immediately, so a later call (once the
    // event loop has advanced the clock) starts a fresh window — exercising the
    // reset-after-expiry branch.
    const shortConfig: RateLimitConfig = { limit: 1, windowSec: 0, prefix: "short" };

    const r1 = await checkRateLimit(key, shortConfig); // 1st — allowed, window already expired
    expect(r1.allowed).toBe(true);

    // A small delay guarantees Date.now() advances past resetAt, so the window expires.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const r2 = await checkRateLimit(key, shortConfig);
    // The expired window reset, so this fresh request is allowed again.
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);
  });
});

describe("RATE_LIMIT_CONFIGS", () => {
  test("exports preset configs for known categories", () => {
    expect(RATE_LIMIT_CONFIGS.api).toBeDefined();
    expect(RATE_LIMIT_CONFIGS.auth).toBeDefined();
    expect(RATE_LIMIT_CONFIGS.ai).toBeDefined();
    expect(RATE_LIMIT_CONFIGS.upload).toBeDefined();
  });

  test("auth config is stricter than api config", () => {
    expect(RATE_LIMIT_CONFIGS.auth.limit).toBeLessThan(RATE_LIMIT_CONFIGS.api.limit);
  });

  test("all configs have positive limit and windowSec", () => {
    for (const [, cfg] of Object.entries(RATE_LIMIT_CONFIGS)) {
      expect(cfg.limit).toBeGreaterThan(0);
      expect(cfg.windowSec).toBeGreaterThan(0);
    }
  });
});
