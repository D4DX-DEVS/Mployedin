/**
 * @jest-environment node
 *
 * Scale / concurrency test for subscription enforcement.
 *
 * Simulates 10,000+ concurrent gated evaluations to prove the feature is
 * production-ready under load:
 *  - a cold burst of flag reads is COALESCED into a single DB query
 *    (no thundering-herd / cache stampede when an instance starts cold)
 *  - warm reads are served from cache with zero extra DB queries
 *  - enforcement OFF (default) passes through WITHOUT any Subscription lookup
 *  - enforcement ON blocks/permits correctly under heavy concurrency
 *  - the admin toggle (cache invalidation) is respected immediately
 *  - no errors / unhandled rejections under load
 */
import { NextRequest, NextResponse } from "next/server";
import {
  isSubscriptionEnforcementEnabled,
  clearSubscriptionEnforcementCache,
} from "@/lib/subscription/enforcementFlag";
import { withSubscription } from "@/lib/subscription/withSubscription";
import Subscription from "@/models/Subscription";
import SystemSettings from "@/models/SystemSettings";
import connectDB from "@/lib/db/mongoose";

// "10000+ employers and employees" — the load the feature must absorb.
const CONCURRENCY = 10_000;

// ── Mocks (the REAL enforcementFlag + withSubscription run; only the DB layer is faked) ──

jest.mock("@/lib/db/mongoose", () => jest.fn().mockResolvedValue(undefined));

jest.mock("@/models/SystemSettings", () => {
  const findOne = jest.fn();
  return { __esModule: true, default: { findOne } };
});

jest.mock("@/models/Subscription", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findByIdAndUpdate: jest.fn() },
}));

jest.mock("@/lib/subscription/gracePeriod", () => ({
  isInGracePeriod: jest.fn().mockResolvedValue(false),
  getGracePeriodEmployerLimits: jest.fn(),
  getGracePeriodJobSeekerLimits: jest.fn(),
}));

const systemFindOne = (SystemSettings as unknown as { findOne: jest.Mock }).findOne;
const subFindOne = (Subscription as unknown as { findOne: jest.Mock }).findOne;
const subFindByIdAndUpdate = (Subscription as unknown as { findByIdAndUpdate: jest.Mock })
  .findByIdAndUpdate;
const connectMock = connectDB as unknown as jest.Mock;

// Mutable "DB" value for the flag; findOne reads it lazily at call time so a
// mid-test admin flip is reflected after the cache is cleared.
let dbFlag = false;

function makeReq(): NextRequest {
  return new NextRequest(new URL("http://localhost/api/test"));
}

// Fresh response per call — a NextResponse body can only be read once.
const okHandler = jest.fn(() => Promise.resolve(NextResponse.json({ ok: true })));

const employerCtx = { userId: "emp", role: "employer" as const, locale: "en" };
const jobSeekerCtx = { userId: "js", role: "job_seeker" as const, locale: "en" };

beforeEach(() => {
  jest.clearAllMocks();
  dbFlag = false;
  clearSubscriptionEnforcementCache();
  systemFindOne.mockImplementation(() => ({
    select: () => ({
      lean: () => Promise.resolve({ subscriptionEnforcementEnabled: dbFlag }),
    }),
  }));
});

describe("subscription enforcement — scale & concurrency", () => {
  test("coalesces 10k concurrent COLD flag reads into a single DB query", async () => {
    dbFlag = true;
    const started = performance.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => isSubscriptionEnforcementEnabled()),
    );
    const ms = performance.now() - started;

    expect(results).toHaveLength(CONCURRENCY);
    expect(results.every((r) => r === true)).toBe(true);
    expect(systemFindOne).toHaveBeenCalledTimes(1); // stampede collapsed to 1 read
    expect(connectMock).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line no-console
    console.log(`[scale] ${CONCURRENCY} cold flag reads → 1 DB query in ${ms.toFixed(1)}ms`);
  }, 30_000);

  test("serves 10k WARM flag reads from cache with zero extra DB queries", async () => {
    dbFlag = false;
    await isSubscriptionEnforcementEnabled(); // warm the cache (1 query)
    expect(systemFindOne).toHaveBeenCalledTimes(1);

    const started = performance.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => isSubscriptionEnforcementEnabled()),
    );
    const ms = performance.now() - started;

    expect(results.every((r) => r === false)).toBe(true);
    expect(systemFindOne).toHaveBeenCalledTimes(1); // still just the one warm read
    // eslint-disable-next-line no-console
    console.log(`[scale] ${CONCURRENCY} warm flag reads → 0 extra DB queries in ${ms.toFixed(1)}ms`);
  }, 30_000);

  test("enforcement OFF: 10k concurrent gated requests pass through with NO subscription lookup", async () => {
    dbFlag = false;
    const wrapped = withSubscription(okHandler, { type: "ai", feature: "ai_chat" });

    const started = performance.now();
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_unused, i) =>
        wrapped(makeReq(), i % 2 === 0 ? employerCtx : jobSeekerCtx),
      ),
    );
    const ms = performance.now() - started;

    expect(responses).toHaveLength(CONCURRENCY);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(okHandler).toHaveBeenCalledTimes(CONCURRENCY);
    expect(subFindOne).not.toHaveBeenCalled(); // never touches the Subscription collection
    expect(systemFindOne).toHaveBeenCalledTimes(1); // single coalesced flag read
    // eslint-disable-next-line no-console
    console.log(`[scale] ${CONCURRENCY} OFF passthrough → 0 subscription lookups in ${ms.toFixed(1)}ms`);
  }, 30_000);

  test("enforcement ON: 10k concurrent no-subscription requests are blocked with 403 SUBSCRIPTION_REQUIRED", async () => {
    dbFlag = true;
    subFindOne.mockResolvedValue(null); // no active subscription, not in grace
    const wrapped = withSubscription(okHandler, { type: "ai", feature: "ai_chat" });

    const started = performance.now();
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => wrapped(makeReq(), employerCtx)),
    );
    const ms = performance.now() - started;

    expect(responses.every((r) => r.status === 403)).toBe(true);
    expect(okHandler).not.toHaveBeenCalled();
    expect(systemFindOne).toHaveBeenCalledTimes(1); // flag read still coalesced under load
    expect(subFindOne).toHaveBeenCalledTimes(CONCURRENCY); // per-user lookup, as expected

    const body = await responses[0].json();
    expect(body.error).toBe("SUBSCRIPTION_REQUIRED");
    // eslint-disable-next-line no-console
    console.log(`[scale] ${CONCURRENCY} ON no-sub → all 403 in ${ms.toFixed(1)}ms`);
  }, 30_000);

  test("enforcement ON: subscribed users within limits are allowed under load", async () => {
    dbFlag = true;
    const activeSub = {
      _id: "sub_1",
      usage: { aiUsage: { ai_chat: 0 } },
      planSnapshot: {
        employerLimits: {
          aiFeatures: [{ feature: "ai_chat", enabled: true, monthlyLimit: 100 }],
        },
      },
    };
    subFindOne.mockResolvedValue(activeSub);
    subFindByIdAndUpdate.mockResolvedValue(null);
    const wrapped = withSubscription(okHandler, { type: "ai", feature: "ai_chat" });

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => wrapped(makeReq(), employerCtx)),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(okHandler).toHaveBeenCalledTimes(CONCURRENCY);
    expect(systemFindOne).toHaveBeenCalledTimes(1);
  }, 30_000);

  test("admin toggle flip is respected immediately after cache invalidation", async () => {
    const wrapped = withSubscription(okHandler, { type: "ai", feature: "ai_chat" });

    // Default OFF → passes through
    dbFlag = false;
    expect((await wrapped(makeReq(), employerCtx)).status).toBe(200);

    // Admin flips ON (settings route clears the cache on change)
    dbFlag = true;
    subFindOne.mockResolvedValue(null);
    clearSubscriptionEnforcementCache();
    expect((await wrapped(makeReq(), employerCtx)).status).toBe(403);

    // Admin flips OFF again
    dbFlag = false;
    clearSubscriptionEnforcementCache();
    expect((await wrapped(makeReq(), employerCtx)).status).toBe(200);
  }, 30_000);

  test("no errors or unhandled rejections across a 10k mixed-role burst", async () => {
    dbFlag = false;
    const wrapped = withSubscription(okHandler, { type: "limit", feature: "activeJobs" });

    await expect(
      Promise.all(
        Array.from({ length: CONCURRENCY }, (_unused, i) =>
          wrapped(makeReq(), i % 3 === 0 ? jobSeekerCtx : employerCtx),
        ),
      ),
    ).resolves.toHaveLength(CONCURRENCY);
  }, 30_000);
});
