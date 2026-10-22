/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// A module, not a script, so these helper names can't clash with other test files.
export {};

type MarkOnce = (key: string, ttlSec: number) => Promise<boolean>;

interface MarkOnceModule {
  markOnce: MarkOnce;
  inMemoryKeyCount: () => number;
  IN_MEMORY_MAX_KEYS: number;
}

/** A fresh module each time, so every test starts with an empty store. */
async function loadModule(): Promise<MarkOnceModule> {
  jest.resetModules();
  return (await import("@/lib/security/markOnce")) as MarkOnceModule;
}

async function loadMarkOnce(): Promise<MarkOnce> {
  return (await loadModule()).markOnce;
}

describe("markOnce (in-memory path)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    jest.useFakeTimers({ now: new Date("2026-10-21T10:00:00Z") });
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("is true for the first caller and false for repeats", async () => {
    const markOnce = await loadMarkOnce();

    await expect(markOnce("k:a", 60)).resolves.toBe(true);
    await expect(markOnce("k:a", 60)).resolves.toBe(false);
    await expect(markOnce("k:a", 60)).resolves.toBe(false);
  });

  it("keeps different keys independent", async () => {
    const markOnce = await loadMarkOnce();

    await expect(markOnce("k:a", 60)).resolves.toBe(true);
    await expect(markOnce("k:b", 60)).resolves.toBe(true);
  });

  it("is true again once the TTL has passed", async () => {
    const markOnce = await loadMarkOnce();

    await expect(markOnce("k:a", 60)).resolves.toBe(true);
    jest.advanceTimersByTime(59_000);
    await expect(markOnce("k:a", 60)).resolves.toBe(false);
    jest.advanceTimersByTime(2_000);
    await expect(markOnce("k:a", 60)).resolves.toBe(true);
  });

  it("does not extend the TTL on a repeat", async () => {
    const markOnce = await loadMarkOnce();

    await markOnce("k:a", 60);
    jest.advanceTimersByTime(40_000);
    await markOnce("k:a", 60); // repeat at t=40s must not push expiry to t=100s
    jest.advanceTimersByTime(21_000); // t=61s
    await expect(markOnce("k:a", 60)).resolves.toBe(true);
  });

  describe("lazy sweep of expired keys", () => {
    it("drops expired keys on the first call after the sweep interval, not before", async () => {
      const { markOnce, inMemoryKeyCount } = await loadModule();
      await markOnce("k:1", 60);
      await markOnce("k:2", 60);
      await markOnce("k:3", 60);
      expect(inMemoryKeyCount()).toBe(3);

      // 4 minutes: all three are expired, but the 5-minute sweep has not come round yet.
      jest.advanceTimersByTime(4 * 60_000);
      await markOnce("live", 3600);
      expect(inMemoryKeyCount()).toBe(4);

      // 6 minutes: the next call sweeps the expired three and keeps the live key.
      jest.advanceTimersByTime(2 * 60_000);
      await markOnce("newer", 3600);
      expect(inMemoryKeyCount()).toBe(2);
      await expect(markOnce("live", 3600)).resolves.toBe(false);
    });

    it("does not hold the process open (no timer is scheduled)", async () => {
      const { markOnce } = await loadModule();

      await markOnce("k:a", 60);

      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe("size cap", () => {
    it("never holds more than the cap, and forgets the oldest keys first", async () => {
      const { markOnce, inMemoryKeyCount, IN_MEMORY_MAX_KEYS } = await loadModule();
      expect(IN_MEMORY_MAX_KEYS).toBe(10_000);

      for (let i = 0; i < IN_MEMORY_MAX_KEYS + 5; i++) await markOnce(`k:${i}`, 3600);

      expect(inMemoryKeyCount()).toBe(IN_MEMORY_MAX_KEYS);
      // k:0..k:4 were the oldest and are gone; k:5 and everything newer is kept.
      // (Check the kept ones first: marking a forgotten key evicts the next oldest.)
      await expect(markOnce(`k:${IN_MEMORY_MAX_KEYS + 4}`, 3600)).resolves.toBe(false);
      await expect(markOnce("k:5", 3600)).resolves.toBe(false);
      await expect(markOnce("k:4", 3600)).resolves.toBe(true);
      expect(inMemoryKeyCount()).toBe(IN_MEMORY_MAX_KEYS);
    });

    it("drops expired keys before it drops a live one", async () => {
      const { markOnce, inMemoryKeyCount, IN_MEMORY_MAX_KEYS } = await loadModule();
      const half = IN_MEMORY_MAX_KEYS / 2;
      // The live keys are the oldest, so dropping "the oldest" would lose them.
      for (let i = 0; i < half; i++) await markOnce(`long:${i}`, 3600);
      for (let i = 0; i < half; i++) await markOnce(`short:${i}`, 60);
      expect(inMemoryKeyCount()).toBe(IN_MEMORY_MAX_KEYS);

      jest.advanceTimersByTime(61_000); // the short keys expire; the 5-minute sweep is not due

      await expect(markOnce("one:more", 3600)).resolves.toBe(true);

      expect(inMemoryKeyCount()).toBe(half + 1);
      await expect(markOnce("long:0", 3600)).resolves.toBe(false);
      await expect(markOnce(`long:${half - 1}`, 3600)).resolves.toBe(false);
    });

    it("keeps one entry per key when an expired key is marked again", async () => {
      const { markOnce, inMemoryKeyCount } = await loadModule();

      await markOnce("k:a", 60);
      jest.advanceTimersByTime(61_000);
      await expect(markOnce("k:a", 60)).resolves.toBe(true);

      expect(inMemoryKeyCount()).toBe(1);
    });
  });
});

describe("markOnce (Upstash path)", () => {
  const originalEnv = { ...process.env };
  const setMock = jest.fn();

  beforeEach(() => {
    setMock.mockReset();
    process.env.UPSTASH_REDIS_REST_URL = "https://example-redis.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    jest.resetModules();
    jest.doMock("@upstash/redis", () => ({
      Redis: jest.fn().mockImplementation(() => ({ set: (...args: unknown[]) => setMock(...args) })),
    }));
  });

  afterEach(() => {
    jest.dontMock("@upstash/redis");
    process.env = { ...originalEnv };
  });

  it("sets the key with NX and the TTL, and is true when Redis stored it", async () => {
    setMock.mockResolvedValue("OK");
    const { markOnce } = await import("@/lib/security/markOnce");

    await expect(markOnce("jobview:1:2", 86_400)).resolves.toBe(true);

    expect(setMock).toHaveBeenCalledWith("jobview:1:2", "1", { nx: true, ex: 86_400 });
  });

  it("is false when Redis already had the key", async () => {
    setMock.mockResolvedValue(null);
    const { markOnce } = await import("@/lib/security/markOnce");

    await expect(markOnce("jobview:1:2", 86_400)).resolves.toBe(false);
  });

  it("rejects when Redis fails, so the caller decides (no silent fall back to per-instance memory)", async () => {
    setMock.mockRejectedValue(new Error("redis down"));
    const { markOnce } = await import("@/lib/security/markOnce");

    await expect(markOnce("jobview:1:2", 86_400)).rejects.toThrow("redis down");
  });
});
