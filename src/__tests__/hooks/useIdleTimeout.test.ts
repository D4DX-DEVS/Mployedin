/**
 * @jest-environment jsdom
 *
 * An idle timeout is the sign-out most likely to happen on a shared computer
 * (the person walked away), so it must clear the device the same way the
 * account menu does — before the session ends.
 */
import { renderHook } from "@testing-library/react";

import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { isSignOutInProgress, markSignOutStarted, resetSignOutInProgress } from "@/lib/consent/deviceStorage";

const calls: string[] = [];
const logoutCleanup = jest.fn(async () => {
  calls.push("cleanup");
});
const signOut = jest.fn(async () => {
  calls.push("signOut");
});

jest.mock("@/lib/consent/logoutCleanup", () => ({ logoutCleanup: () => logoutCleanup() }));
jest.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...(args as [])) }));

describe("useIdleTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    calls.length = 0;
    logoutCleanup.mockClear();
    signOut.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetSignOutInProgress();
  });

  it("clears the device, then signs out, once the person has been idle too long", async () => {
    renderHook(() => useIdleTimeout({ timeout: 1_000, checkInterval: 500 }));

    await jest.advanceTimersByTimeAsync(1_600);

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/en/login?reason=idle" });
    expect(logoutCleanup).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["cleanup", "signOut"]);
  });

  it("signs out once, not on every check while the cleanup is still running", async () => {
    renderHook(() => useIdleTimeout({ timeout: 1_000, checkInterval: 500 }));

    await jest.advanceTimersByTimeAsync(3_000);

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("tries again at the next check if the sign-out failed", async () => {
    signOut.mockRejectedValueOnce(new Error("offline"));
    renderHook(() => useIdleTimeout({ timeout: 1_000, checkInterval: 500 }));

    await jest.advanceTimersByTimeAsync(2_000);

    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("lets autosave write again if the sign-out failed and the person stays", async () => {
    signOut.mockRejectedValueOnce(new Error("offline"));
    // the real cleanup marks sign-out as started; the mocked one here does not
    logoutCleanup.mockImplementationOnce(async () => {
      markSignOutStarted();
    });
    renderHook(() => useIdleTimeout({ timeout: 1_000, checkInterval: 10_000 }));

    await jest.advanceTimersByTimeAsync(10_000);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(isSignOutInProgress()).toBe(false);
  });

  it("does nothing while the person is active", async () => {
    renderHook(() => useIdleTimeout({ timeout: 10_000, checkInterval: 500 }));

    await jest.advanceTimersByTimeAsync(2_000);

    expect(logoutCleanup).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
