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

  it("stops recording activity once a sign-out has started, so the cleanup's wipe is not undone", () => {
    renderHook(() => useIdleTimeout({ timeout: 600_000, checkInterval: 60_000 }));
    expect(localStorage.getItem("mployedin_last_activity")).not.toBeNull();

    // What logoutCleanup does first: flag the sign-out, then wipe the device.
    markSignOutStarted();
    localStorage.removeItem("mployedin_last_activity");
    // The person moves the mouse while "Logging out..." waits for the server
    // (activity is recorded at most every 10 seconds, so step past that each time).
    jest.advanceTimersByTime(11_000);
    document.dispatchEvent(new Event("mousedown"));
    jest.advanceTimersByTime(11_000);
    document.dispatchEvent(new Event("keydown"));
    expect(localStorage.getItem("mployedin_last_activity")).toBeNull();

    // A sign-out that failed: the person is still signed in, and activity counts again.
    resetSignOutInProgress();
    jest.advanceTimersByTime(11_000);
    document.dispatchEvent(new Event("keydown"));
    expect(localStorage.getItem("mployedin_last_activity")).not.toBeNull();
  });

  it("holds writers back for longer than the account menu waits for the server (30 s)", () => {
    markSignOutStarted();
    jest.advanceTimersByTime(40_000);
    expect(isSignOutInProgress()).toBe(true);
    jest.advanceTimersByTime(10_000);
    expect(isSignOutInProgress()).toBe(false);
  });

  it("does nothing while the person is active", async () => {
    renderHook(() => useIdleTimeout({ timeout: 10_000, checkInterval: 500 }));

    await jest.advanceTimersByTimeAsync(2_000);

    expect(logoutCleanup).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
