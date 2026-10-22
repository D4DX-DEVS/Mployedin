/**
 * @jest-environment jsdom
 *
 * Signing out of the account menu has to clear what the device keeps for the
 * next person (push subscription, drafts, chats, Firebase user) — and it has to
 * do it BEFORE the session ends, because removing the push subscription is an
 * authenticated request.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserProfileDropdown } from "@/components/shared/UserProfileDropdown";

const calls: string[] = [];
const logoutCleanup = jest.fn(async () => {
  calls.push("cleanup");
});
const signOut = jest.fn(async () => {
  calls.push("signOut");
});

jest.mock("@/lib/consent/logoutCleanup", () => ({ logoutCleanup: () => logoutCleanup() }));
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

  beforeEach(() => {
    calls.length = 0;
    logoutCleanup.mockClear();
    signOut.mockClear();
    // Sign-out ends in window.location.href, which jsdom reports as unimplemented.
    const log = console.error;
    errorSpy = jest.spyOn(console, "error").mockImplementation((...args) => {
      if (String(args[0]).includes("Not implemented: navigation")) return;
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
});
