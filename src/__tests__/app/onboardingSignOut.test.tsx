/**
 * @jest-environment jsdom
 *
 * The onboarding top bar's Sign out clears the device and then ends the
 * session. A second click while the cleanup is still running must not start a
 * second one.
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
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} {...props} />,
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "X Beat" } }, update: jest.fn() }),
  signOut: (...args: unknown[]) => signOut(...(args as [])),
}));

import JobSeekerOnboardingPage from "@/app/[locale]/(onboarding)/onboarding/page";

describe("onboarding: Sign out", () => {
  beforeEach(() => {
    calls.length = 0;
    resetSignOutInProgress();
    logoutCleanup.mockClear();
    signOut.mockClear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: null }) }) as unknown as typeof fetch;
  });

  it("runs the cleanup and sign-out once on a double click, and disables the button meanwhile", async () => {
    render(<JobSeekerOnboardingPage />);
    const button = screen.getByRole("button", { name: /sign out/i });

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
    render(<JobSeekerOnboardingPage />);
    const button = screen.getByRole("button", { name: /sign out/i });

    fireEvent.click(button);
    expect(isSignOutInProgress()).toBe(true);
    releaseCleanup();

    await waitFor(() => expect(button).toBeEnabled());
    expect(isSignOutInProgress()).toBe(false);
  });
});
