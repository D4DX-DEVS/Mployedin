/**
 * @jest-environment jsdom
 *
 * "Back to sign in" clears the device and then ends the session. The cleanup
 * can take a moment (it waits on the push service), so a second click must not
 * start a second cleanup + sign-out.
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

jest.mock("@/lib/consent/logoutCleanup", () => ({ logoutCleanup: () => logoutCleanup() }));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated", update: jest.fn(async () => null) }),
  signOut: (...args: unknown[]) => signOut(...(args as [])),
}));
const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams("email=agent@mployedin.com"),
}));

import VerifyEmailPage from "@/app/[locale]/(auth)/verify-email/page";

describe("verify-email: Back to sign in", () => {
  beforeEach(() => {
    calls.length = 0;
    resetSignOutInProgress();
    logoutCleanup.mockClear();
    signOut.mockClear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("runs the cleanup and sign-out once on a double click, and disables the button meanwhile", async () => {
    render(<VerifyEmailPage />);
    const button = await screen.findByRole("button", { name: "backToSignIn" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(logoutCleanup).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());

    releaseCleanup();
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["cleanup", "signOut"]);
  });

  it("frees the button and lets autosave write again when the sign-out fails", async () => {
    signOut.mockRejectedValueOnce(new Error("offline"));
    render(<VerifyEmailPage />);
    const button = await screen.findByRole("button", { name: "backToSignIn" });

    fireEvent.click(button);
    expect(isSignOutInProgress()).toBe(true);
    releaseCleanup();

    await waitFor(() => expect(button).toBeEnabled());
    expect(isSignOutInProgress()).toBe(false);
  });
});
