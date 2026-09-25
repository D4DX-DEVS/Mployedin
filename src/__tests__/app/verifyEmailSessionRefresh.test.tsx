/**
 * @jest-environment jsdom
 *
 * After a successful verify the JWT still says "unverified", so the proxy keeps
 * sending the user back to /verify-email until the session is refreshed.
 * next-auth's update() silently does nothing while the session is loading, and a
 * link is verified on mount — before it has loaded — so the refresh was skipped
 * and a signed-in user was stuck (re-verification 2026-09-24, found converting a
 * lead). The refresh must happen once the session has loaded, exactly once.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const update = jest.fn(async () => null);
let sessionStatus: "loading" | "authenticated" | "unauthenticated" = "loading";
jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: sessionStatus === "authenticated" ? { user: { role: "employer" } } : null,
    status: sessionStatus,
    update,
  }),
  signOut: jest.fn(),
}));

const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams("token=abc123&email=test@example.com"),
}));

import VerifyEmailPage from "@/app/[locale]/(auth)/verify-email/page";

beforeEach(() => {
  update.mockClear();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
});

it("refreshes the session once it has loaded, not while it is loading", async () => {
  sessionStatus = "loading";
  const { rerender } = render(<VerifyEmailPage />);
  expect(await screen.findByText("verifiedTitle")).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  // The dashboard button waits for the refresh instead of bouncing back here.
  expect(screen.getByRole("button", { name: "continueToDashboard" })).toBeDisabled();

  sessionStatus = "authenticated";
  rerender(<VerifyEmailPage />);
  await waitFor(() => expect(update).toHaveBeenCalledWith({ isEmailVerified: true }));
  rerender(<VerifyEmailPage />);
  expect(update).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByRole("link", { name: "continueToDashboard" })).toHaveAttribute("href", "/en/employer"));
});

it("does not try to refresh for a visitor who is signed out", async () => {
  sessionStatus = "unauthenticated";
  render(<VerifyEmailPage />);
  expect(await screen.findByRole("link", { name: "continueToSignIn" })).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
});
