/**
 * @jest-environment node
 *
 * A changed or reset password must end every session the old one opened, on
 * every device, at once. The JWT's `iat` cannot decide that: it is rewritten
 * each time the cookie is re-issued, so a session in use always looked newer
 * than the change. The account's `sessionsValidAfter` is the cut-off; each
 * session's sign-in time (`authAtMs`, or `authAt` in seconds on older tokens)
 * is compared with it.
 *
 * The jwt callback runs on every request, so the cut-off is read at most once
 * per 30 s per account per server, and the server that made the change knows
 * it at once. Steps that hand out lasting access read it fresh.
 */
const userFindById = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: (...a: unknown[]) => userFindById(...a) },
}));
const mcpUpdateMany = jest.fn();
jest.mock("@/models/McpToken", () => ({
  __esModule: true,
  default: { updateMany: (...a: unknown[]) => mcpUpdateMany(...a) },
}));
const pushDeleteMany = jest.fn();
jest.mock("@/models/PushSubscription", () => ({
  __esModule: true,
  PushSubscription: { deleteMany: (...a: unknown[]) => pushDeleteMany(...a) },
}));
jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
  default: jest.fn().mockResolvedValue(undefined),
}));
const logWarn = jest.fn();
const logError = jest.fn();
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: (...a: unknown[]) => logWarn(...a), error: (...a: unknown[]) => logError(...a) },
}));

import {
  __resetCutOffCacheForTests,
  endAllSessions,
  noteSessionsCutOff,
  revokeMcpGrants,
  sessionEndedNow,
  sessionsCutOffFor,
  signedInBeforeCutOff,
} from "@/lib/auth/sessionCutOff";

const T = new Date("2026-11-12T12:00:00.700Z");
const T_MS = T.getTime();
const T_SEC = Math.floor(T_MS / 1000);

function storedCutOff(value: Date | undefined) {
  userFindById.mockReturnValue({
    select: (projection: string) => {
      expect(projection).toBe("sessionsValidAfter");
      return { lean: () => Promise.resolve(value === undefined ? {} : { sessionsValidAfter: value }) };
    },
  });
}

beforeEach(() => {
  jest.useRealTimers();
  __resetCutOffCacheForTests();
  userFindById.mockReset();
  mcpUpdateMany.mockReset().mockResolvedValue({ modifiedCount: 1 });
  pushDeleteMany.mockReset().mockResolvedValue({ deletedCount: 1 });
  logWarn.mockClear();
  logError.mockClear();
});

describe("signedInBeforeCutOff", () => {
  it("ends a session that signed in before the cut-off", () => {
    expect(signedInBeforeCutOff({ authAtMs: T_MS - 60_000 }, T)).toBe(true);
    expect(signedInBeforeCutOff({ authAtMs: T_MS - 60_000 }, T_MS)).toBe(true);
  });

  it("ends a session from earlier in the same second", () => {
    // Whole seconds let a sign-in a few hundred ms before the change survive.
    expect(signedInBeforeCutOff({ authAtMs: T_MS - 300, authAt: T_SEC }, T)).toBe(true);
  });

  it("keeps the sign-in that set it (stamped after the cut-off was written)", () => {
    expect(signedInBeforeCutOff({ authAtMs: T_MS, authAt: T_SEC }, T)).toBe(false);
    expect(signedInBeforeCutOff({ authAtMs: T_MS + 5 }, T)).toBe(false);
  });

  it("compares an older token with only seconds in whole seconds", () => {
    expect(signedInBeforeCutOff({ authAt: T_SEC - 1 }, T)).toBe(true);
    expect(signedInBeforeCutOff({ authAt: T_SEC }, T)).toBe(false);
  });

  it("treats a session with no sign-in time as older", () => {
    expect(signedInBeforeCutOff({}, T)).toBe(true);
    expect(signedInBeforeCutOff({ authAt: "1700000000" }, T)).toBe(true);
    expect(signedInBeforeCutOff(undefined, T)).toBe(true);
  });

  it("keeps every session when there is no cut-off", () => {
    expect(signedInBeforeCutOff({}, undefined)).toBe(false);
    expect(signedInBeforeCutOff({}, null)).toBe(false);
    expect(signedInBeforeCutOff({}, 0)).toBe(false);
  });
});

describe("sessionsCutOffFor", () => {
  it("reads the account's cut-off in milliseconds", async () => {
    storedCutOff(T);
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(T_MS);
    expect(userFindById).toHaveBeenCalledWith("user-1");
  });

  it("answers 0 for an account that never had one", async () => {
    storedCutOff(undefined);
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(0);
  });

  it("reads the database at most once per 30 seconds per account", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-12T13:00:00Z") });
    storedCutOff(undefined);
    await sessionsCutOffFor("user-1");
    await sessionsCutOffFor("user-1");
    expect(userFindById).toHaveBeenCalledTimes(1);

    // A change made on another server is seen here once the 30 s are up.
    storedCutOff(T);
    jest.advanceTimersByTime(30_001);
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(T_MS);
    expect(userFindById).toHaveBeenCalledTimes(2);
  });

  it("knows a cut-off made on this server at once, with no read", async () => {
    storedCutOff(undefined);
    await sessionsCutOffFor("user-1");
    noteSessionsCutOff("user-1", T);
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(T_MS);
    expect(userFindById).toHaveBeenCalledTimes(1);
  });

  it("never moves a cut-off back", async () => {
    noteSessionsCutOff("user-1", T);
    noteSessionsCutOff("user-1", new Date(T_MS - 60_000));
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(T_MS);
  });

  it("lets sessions through when the database cannot be read, and says so", async () => {
    // Fail open, like the sign-out check: an outage must not sign everyone out.
    userFindById.mockImplementation(() => {
      throw new Error("db down");
    });
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(0);
    expect(logWarn).toHaveBeenCalled();
  });

  it("still applies a cut-off it already knew when the database cannot be read", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-12T13:00:00Z") });
    noteSessionsCutOff("user-1", T);
    jest.advanceTimersByTime(30_001);
    userFindById.mockImplementation(() => {
      throw new Error("db down");
    });
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(T_MS);
  });
});

describe("sessionEndedNow", () => {
  it("reads the database even when the cache says the session is fine", async () => {
    // Another server ended the session a few seconds ago; this one's cache
    // has not caught up. Lasting access must not be handed out in that gap.
    storedCutOff(undefined);
    await sessionsCutOffFor("user-1");
    storedCutOff(T);
    await expect(sessionEndedNow("user-1", { authAtMs: T_MS - 10_000 })).resolves.toBe(true);
    expect(userFindById).toHaveBeenCalledTimes(2);
    // And the cache learns it.
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(T_MS);
  });

  it("keeps a session signed in after the cut-off", async () => {
    storedCutOff(T);
    await expect(sessionEndedNow("user-1", { authAtMs: T_MS + 1 })).resolves.toBe(false);
  });

  it("refuses the step when the database cannot be read", async () => {
    userFindById.mockImplementation(() => {
      throw new Error("db down");
    });
    await expect(sessionEndedNow("user-1", { authAtMs: Date.now() })).resolves.toBe(true);
  });
});

describe("endAllSessions", () => {
  it("cuts the web sessions and revokes every app grant of the account", async () => {
    await endAllSessions("user-1", T);
    await expect(sessionsCutOffFor("user-1")).resolves.toBe(T_MS);
    expect(userFindById).not.toHaveBeenCalled();
    // MCP access and refresh tokens (ChatGPT, Claude connectors).
    expect(mcpUpdateMany).toHaveBeenCalledWith({ userId: "user-1", isRevoked: false }, { $set: { isRevoked: true } });
    // Browser push would keep reaching the browsers just signed out.
    expect(pushDeleteMany).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("never throws: the password is already changed", async () => {
    mcpUpdateMany.mockRejectedValue(new Error("db down"));
    pushDeleteMany.mockRejectedValue(new Error("db down"));
    await expect(endAllSessions("user-1", T)).resolves.toBeUndefined();
    await expect(revokeMcpGrants("user-1")).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});
