/**
 * @jest-environment jsdom
 *
 * Signing out of the account menu has to clear what the device keeps for the
 * next person (push subscription, drafts, chats, Firebase user) — and it has to
 * do it BEFORE the session ends, because removing the push subscription is an
 * authenticated request.
 *
 * It also has to really end the session. It used to wait 4 seconds for the
 * server and then go to the login page whatever had happened: on a slow
 * connection the request was cut off by that navigation, and the person landed
 * back in their dashboard, still signed in, having been told nothing.
 */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserProfileDropdown } from "@/components/shared/UserProfileDropdown";

const calls: string[] = [];
const logoutCleanup = jest.fn(async () => {
  calls.push("cleanup");
});
const signOut = jest.fn(async (): Promise<void> => {
  calls.push("signOut");
});
const sessionEnded = jest.fn(async () => true);
const resetSignOutInProgress = jest.fn();

jest.mock("@/lib/consent/logoutCleanup", () => ({ logoutCleanup: () => logoutCleanup() }));
jest.mock("@/lib/auth/sessionEnded", () => ({ sessionEnded: () => sessionEnded() }));
jest.mock("@/lib/consent/deviceStorage", () => ({
  ...jest.requireActual("@/lib/consent/deviceStorage"),
  resetSignOutInProgress: () => resetSignOutInProgress(),
}));
jest.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOut(...(args as [])),
  useSession: () => ({ data: { user: { image: null } }, update: jest.fn() }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("@/components/shared/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
jest.mock("@/lib/a11y/usePreferences", () => ({ openAccessibilityPanel: jest.fn() }));

async function confirmLogout() {
  const user = userEvent.setup();
  render(
    <UserProfileDropdown
      userName="Sara Ahmed"
      userEmail="sara@example.com"
      userRole="employer"
      locale="en"
    />
  );
  await user.click(screen.getByRole("button", { name: "Open user menu" }));
  await user.click(await screen.findByRole("menuitem", { name: "Logout" }));
  await user.click(await screen.findByRole("button", { name: "Log Out" }));
}

describe("account menu: log out", () => {
  let errorSpy: jest.SpyInstance;
  /** Times the page tried to leave (window.location.href = ...), which jsdom reports instead of doing. */
  let navigations = 0;

  beforeEach(() => {
    calls.length = 0;
    navigations = 0;
    logoutCleanup.mockClear();
    resetSignOutInProgress.mockClear();
    signOut.mockReset().mockImplementation(async () => {
      calls.push("signOut");
    });
    sessionEnded.mockReset().mockResolvedValue(true);
    // Sign-out ends in window.location.href, which jsdom reports as unimplemented.
    const log = console.error;
    errorSpy = jest.spyOn(console, "error").mockImplementation((...args) => {
      if (String(args[0]).includes("Not implemented: navigation")) {
        navigations += 1;
        return;
      }
      log(...args);
    });
  });

  afterEach(() => errorSpy.mockRestore());

  it("clears the device before it ends the session", async () => {
    await confirmLogout();

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirect: false }));
    expect(logoutCleanup).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["cleanup", "signOut"]);
  });

  it("goes to the login page once the server confirms the session has ended", async () => {
    await confirmLogout();

    await waitFor(() => expect(navigations).toBe(1));
    expect(sessionEnded).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("waits for a slow sign-out: it does not leave after a few seconds with the session still open", async () => {
    let finish: () => void = () => undefined;
    signOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          calls.push("signOut");
          finish = resolve;
        }),
    );
    await confirmLogout();
    await waitFor(() => expect(signOut).toHaveBeenCalled());

    // Longer than the 4 seconds it used to wait before leaving regardless.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4500));
    });
    expect(navigations).toBe(0);
    expect(sessionEnded).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Logging out/ })).toBeDisabled();

    await act(async () => finish());
    await waitFor(() => expect(navigations).toBe(1));
  }, 15_000);

  it("stays and says so when the session is still open afterwards, so nobody walks away signed in", async () => {
    sessionEnded.mockResolvedValue(false);
    await confirmLogout();

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't log you out. Check your connection and try again.");
    expect(navigations).toBe(0);
    // The button works again for another try, and autosave is no longer held back.
    expect(screen.getByRole("button", { name: "Log Out" })).toBeEnabled();
    expect(resetSignOutInProgress).toHaveBeenCalledTimes(1);
  });

  it("checks the session even when the sign-out request itself failed (offline)", async () => {
    signOut.mockRejectedValue(new Error("network"));
    sessionEnded.mockResolvedValue(false);
    await confirmLogout();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(sessionEnded).toHaveBeenCalledTimes(1);
    expect(navigations).toBe(0);
  });

  it("does not show the old message again when the dialog is cancelled and opened later", async () => {
    sessionEnded.mockResolvedValue(false);
    await confirmLogout();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Log Out" })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Open user menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Logout" }));

    await screen.findByRole("button", { name: "Log Out" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a second try that succeeds clears the message and leaves", async () => {
    sessionEnded.mockResolvedValueOnce(false).mockResolvedValue(true);
    await confirmLogout();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Log Out" }));
    await waitFor(() => expect(navigations).toBe(1));
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
