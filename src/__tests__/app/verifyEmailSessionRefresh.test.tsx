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
// Marks client-side (router) navigations so a test can tell them from full page loads.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a data-client-nav href={href} {...props}>{children}</a>
  ),
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

// Sign-in sent this user to the dashboard and the proxy redirected them here.
// The Next client router remembers that redirect for about 5 minutes, so a
// client-side navigation to the dashboard landed back on this page without
// asking the server (reproduced 2026-09-29 with an admin-created super agent).
// Reloading worked. The button has to load the page from the server.
it("goes to the dashboard with a full page load, not a client-side navigation", async () => {
  sessionStatus = "authenticated";
  render(<VerifyEmailPage />);
  const cta = await screen.findByRole("link", { name: "continueToDashboard" });
  expect(cta).toHaveAttribute("href", "/en/employer");
  expect(cta).not.toHaveAttribute("data-client-nav");
});

it("does not try to refresh for a visitor who is signed out", async () => {
  sessionStatus = "unauthenticated";
  render(<VerifyEmailPage />);
  expect(await screen.findByRole("link", { name: "continueToSignIn" })).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
});
