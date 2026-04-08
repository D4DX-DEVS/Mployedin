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

  test("allows requests within limit", () => {
    const key = uniqueKey();
    const r1 = checkRateLimit(key, testConfig);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
  });

  test("counts requests correctly and decrements remaining", () => {
    const key = uniqueKey();
    checkRateLimit(key, testConfig); // 1
    const r2 = checkRateLimit(key, testConfig); // 2
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
  });

  test("blocks after exceeding limit", () => {
    const key = uniqueKey();
    checkRateLimit(key, testConfig); // 1
    checkRateLimit(key, testConfig); // 2
    checkRateLimit(key, testConfig); // 3 (last allowed)
    const r4 = checkRateLimit(key, testConfig); // 4 (blocked)
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  test("allows exactly 'limit' requests", () => {
    const key = uniqueKey();
    for (let i = 0; i < testConfig.limit; i++) {
      expect(checkRateLimit(key, testConfig).allowed).toBe(true);
    }
    expect(checkRateLimit(key, testConfig).allowed).toBe(false);
  });

  test("different keys are isolated", () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();

    // Exhaust key1
    for (let i = 0; i <= testConfig.limit; i++) {
      checkRateLimit(key1, testConfig);
    }
    expect(checkRateLimit(key1, testConfig).allowed).toBe(false);

    // key2 should still be allowed
    expect(checkRateLimit(key2, testConfig).allowed).toBe(true);
  });

  test("different prefixes create separate namespaces", () => {
    const key = uniqueKey();
    const configA: RateLimitConfig = { limit: 1, windowSec: 60, prefix: "ns-a" };
    const configB: RateLimitConfig = { limit: 1, windowSec: 60, prefix: "ns-b" };

    checkRateLimit(key, configA); // 1st for ns-a
    expect(checkRateLimit(key, configA).allowed).toBe(false); // 2nd — blocked

    // ns-b should still allow
    expect(checkRateLimit(key, configB).allowed).toBe(true);
  });

  test("returns resetAt timestamp in the future", () => {
    const key = uniqueKey();
    const result = checkRateLimit(key, testConfig);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  test("remaining never goes below 0", () => {
    const key = uniqueKey();
    for (let i = 0; i < testConfig.limit + 5; i++) {
      checkRateLimit(key, testConfig);
    }
    const result = checkRateLimit(key, testConfig);
    expect(result.remaining).toBe(0);
  });

  test("uses default api config when none provided", () => {
    const key = uniqueKey();
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(true);
    // Default api config has limit=100, so remaining should be 99
    expect(result.remaining).toBe(RATE_LIMIT_CONFIGS.api.limit - 1);
  });

  test("window resets after expiry", () => {
    const key = uniqueKey();
    // Use a 0-second window to simulate immediate expiry
    const shortConfig: RateLimitConfig = { limit: 1, windowSec: 0, prefix: "short" };

    checkRateLimit(key, shortConfig); // 1st — allowed (creates entry with resetAt = now + 0)
    // The entry was created with resetAt in the past (or right at now),
    // so the next call should create a fresh entry
    const r2 = checkRateLimit(key, shortConfig);
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
