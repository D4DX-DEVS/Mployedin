/**
 * @jest-environment jsdom
 *
 * "Sign out" and "Sign in again" on /accept-terms end the session like any
 * other sign-out, so they clear the device first.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isSignOutInProgress, markSignOutStarted, resetSignOutInProgress } from "@/lib/consent/deviceStorage";

import { AcceptTermsForm } from "@/components/features/auth/AcceptTermsForm";

const calls: string[] = [];
let holdCleanup = false;
let releaseCleanup: () => void = () => {};
const logoutCleanup = jest.fn(async () => {
  calls.push("cleanup");
  markSignOutStarted(); // as the real cleanup does
  if (!holdCleanup) return;
  await new Promise<void>((resolve) => {
    releaseCleanup = resolve;
  });
});
const signOut = jest.fn(async () => {
  calls.push("signOut");
});

jest.mock("@/lib/consent/logoutCleanup", () => ({ logoutCleanup: () => logoutCleanup() }));
jest.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOut(...(args as [])),
  useSession: () => ({ status: "authenticated", update: jest.fn() }),
}));

describe("accept-terms sign-out", () => {
  beforeEach(() => {
    calls.length = 0;
    holdCleanup = false;
    resetSignOutInProgress();
    logoutCleanup.mockClear();
    signOut.mockClear();
  });

  it("clears the device before 'Sign out' ends the session", async () => {
    render(<AcceptTermsForm locale="en" state="first" destination="/en/job-seeker" />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/en/login" }));
    expect(calls).toEqual(["cleanup", "signOut"]);
  });

  it("clears the device before 'Sign in again' ends the stale session", async () => {
    render(<AcceptTermsForm locale="en" state="signedOut" destination="/en/job-seeker" />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/en/login" }));
    expect(calls).toEqual(["cleanup", "signOut"]);
  });

  it("runs the cleanup and sign-out once on a double click, and disables both buttons meanwhile", async () => {
    holdCleanup = true; // the cleanup waits until released
    render(<AcceptTermsForm locale="en" state="first" destination="/en/job-seeker" />);
    const signOutButton = screen.getByRole("button", { name: "Sign out" });

    fireEvent.click(signOutButton);
    fireEvent.click(signOutButton);

    expect(logoutCleanup).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(signOutButton).toBeDisabled());
    expect(screen.getByRole("button", { name: "Accept and continue" })).toBeDisabled();

    releaseCleanup();
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["cleanup", "signOut"]);
  });

  it("frees the buttons and lets autosave write again when the sign-out fails", async () => {
    signOut.mockRejectedValueOnce(new Error("offline"));
    render(<AcceptTermsForm locale="en" state="first" destination="/en/job-seeker" />);
    const signOutButton = screen.getByRole("button", { name: "Sign out" });

    fireEvent.click(signOutButton);

    await waitFor(() => expect(signOutButton).toBeEnabled());
    expect(isSignOutInProgress()).toBe(false);
  });
});
