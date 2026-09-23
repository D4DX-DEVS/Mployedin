/**
 * @jest-environment node
 *
 * 2026-09-23 audit: a session cookie copied before sign-out kept working for
 * up to 3 days (stateless JWT). Sign-out now records the session id; the jwt
 * callback refuses a revoked id.
 */

const exists = jest.fn();
const updateOne = jest.fn().mockResolvedValue({});
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/models/RevokedSession", () => ({
  __esModule: true,
  default: { exists: (...a: unknown[]) => exists(...a), updateOne: (...a: unknown[]) => updateOne(...a) },
}));

import { isSessionRevoked, revokeSession, __resetRevocationCacheForTests } from "@/lib/auth/sessionRevocation";

beforeEach(() => {
  exists.mockReset();
  updateOne.mockClear();
  __resetRevocationCacheForTests();
  jest.useRealTimers();
});

describe("session revocation store", () => {
  it("a session revoked on this instance is refused immediately, without a DB read", async () => {
    await revokeSession("sid-1", Math.floor(Date.now() / 1000) + 3600, "user-1");
    expect(updateOne).toHaveBeenCalledWith(
      { sid: "sid-1" },
      { $setOnInsert: expect.objectContaining({ sid: "sid-1", userId: "user-1", expiresAt: expect.any(Date) }) },
      { upsert: true },
    );
    expect(await isSessionRevoked("sid-1")).toBe(true);
    expect(exists).not.toHaveBeenCalled();
  });

  it("a session revoked on another instance is found in the DB", async () => {
    exists.mockResolvedValue({ _id: "x" });
    expect(await isSessionRevoked("sid-2")).toBe(true);
    // and remembered locally afterwards
    expect(await isSessionRevoked("sid-2")).toBe(true);
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it("caches a clean result so every request doesn't hit the DB, then re-checks", async () => {
    jest.useFakeTimers({ now: new Date("2026-09-23T10:00:00Z") });
    exists.mockResolvedValue(null);
    expect(await isSessionRevoked("sid-3")).toBe(false);
    expect(await isSessionRevoked("sid-3")).toBe(false);
    expect(exists).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date("2026-09-23T10:00:31Z"));
    exists.mockResolvedValue({ _id: "x" });
    expect(await isSessionRevoked("sid-3")).toBe(true);
    expect(exists).toHaveBeenCalledTimes(2);
  });

  it("fails open when the DB is unreachable (an outage must not sign everyone out)", async () => {
    exists.mockRejectedValue(new Error("db down"));
    expect(await isSessionRevoked("sid-4")).toBe(false);
  });

  it("still revokes locally when the DB write fails", async () => {
    updateOne.mockRejectedValueOnce(new Error("db down"));
    await revokeSession("sid-5", Math.floor(Date.now() / 1000) + 60);
    expect(await isSessionRevoked("sid-5")).toBe(true);
  });
});
