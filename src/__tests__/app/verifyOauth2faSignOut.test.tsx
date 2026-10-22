/**
 * @jest-environment jsdom
 *
 * The 2FA page's "Sign out" ends the session with {redirect:false} and then
 * moves on with a client-side router.replace, so the page is never reloaded.
 * The sign-out-in-progress flag therefore has to be cleared by hand, or the next
 * sign-in in the same tab would have draft and chat autosave switched off.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isSignOutInProgress, markSignOutStarted, resetSignOutInProgress } from "@/lib/consent/deviceStorage";

const calls: string[] = [];
let releaseCleanup: () => void = () => {};
const logoutCleanup = jest.fn(
  () =>
    new Promise<void>((resolve) => {
      calls.push("cleanup");
      markSignOutStarted(); // as the real cleanup does
      releaseCleanup = resolve;
    })
);
const signOut = jest.fn(async () => {
  calls.push("signOut");
});
// What the flag said at the moment the page left for /login.
let flagAtNavigation: boolean | null = null;
const replace = jest.fn((path: string) => {
  if (path.endsWith("/login")) flagAtNavigation = isSignOutInProgress();
});

jest.mock("@/lib/consent/logoutCleanup", () => ({ logoutCleanup: () => logoutCleanup() }));
jest.mock("next-auth/react", () => ({
  // A pending-2FA session keeps the page on screen instead of redirecting away.
  getSession: jest.fn().mockResolvedValue({ user: { pending2fa: true } }),
  signOut: (...args: unknown[]) => signOut(...(args as [])),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useParams: () => ({ locale: "en" }),
}));

import VerifyOAuth2faPage from "@/app/[locale]/(auth)/verify-oauth-2fa/page";

describe("verify-oauth-2fa: Sign out", () => {
  beforeEach(() => {
    calls.length = 0;
    flagAtNavigation = null;
    resetSignOutInProgress();
    logoutCleanup.mockClear();
    signOut.mockClear();
    replace.mockClear();
  });

  async function openPage() {
    render(<VerifyOAuth2faPage />);
    return screen.getByRole("button", { name: "Sign out" });
  }

  it("clears the flag after a successful sign-out, before it navigates client-side", async () => {
    const button = await openPage();

    fireEvent.click(button);
    expect(isSignOutInProgress()).toBe(true);
    releaseCleanup();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/login"));
    expect(calls).toEqual(["cleanup", "signOut"]);
    expect(flagAtNavigation).toBe(false);
  });

  it("runs the cleanup and sign-out once on a double click, and disables the button meanwhile", async () => {
    const button = await openPage();

    fireEvent.click(button);
    fireEvent.click(button);

    expect(logoutCleanup).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
    releaseCleanup();
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("frees the button and clears the flag when the sign-out fails", async () => {
    signOut.mockRejectedValueOnce(new Error("offline"));
    const button = await openPage();

    fireEvent.click(button);
    releaseCleanup();

    await waitFor(() => expect(button).toBeEnabled());
    expect(isSignOutInProgress()).toBe(false);
    expect(replace).not.toHaveBeenCalledWith("/en/login");
  });
});
