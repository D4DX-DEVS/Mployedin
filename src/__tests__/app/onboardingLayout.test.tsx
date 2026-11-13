/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import OnboardingLayout from "@/app/[locale]/(onboarding)/layout";
import { auth } from "@/lib/auth/config";

jest.mock("next/navigation", () => ({
  ...jest.requireActual("next/navigation"),
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "u1", role: "job_seeker" } }),
}));

jest.mock("@/components/shared/SessionWrapper", () => ({
  SessionWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/shared/CsrfProvider", () => ({
  CsrfProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// An async server component; the banner has its own test (responsiveVisualSystem).
jest.mock("@/components/shared/CookieConsentMount", () => ({ CookieConsentMount: () => null }));

jest.mock("@/lib/cms/legalPageStatus", () => ({
  isLegalPagePublished: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/components/shared/PublicFooter", () => ({
  __esModule: true,
  default: ({ locale, variant, showAccessibilityLink }: { locale: string; variant: string; showAccessibilityLink?: boolean }) => (
    <footer data-testid="public-footer">
      {locale}:{variant}:{showAccessibilityLink ? "a11y" : "no-a11y"}
    </footer>
  ),
}));

describe("OnboardingLayout", () => {
  it("forces a light theme scope for the onboarding flow", async () => {
    render(
      await OnboardingLayout({
        children: <div>Onboarding content</div>,
        params: Promise.resolve({ locale: "en" }),
      })
    );

    const scope = document.querySelector('[data-theme-scope="light"]');

    expect(scope).not.toBeNull();
    expect(scope).toHaveClass("theme-light", "bg-background", "text-foreground");
    expect(screen.getByText("Onboarding content")).toBeInTheDocument();
    expect(screen.getByTestId("public-footer")).toHaveTextContent("en:embedded:a11y");
  });

  it("clears a dead session cookie instead of sending it to the login page", async () => {
    // A session ended on the server (password changed elsewhere, sign-out)
    // still decrypts at the edge, and the proxy bounces a signed-in visitor
    // from /login back to onboarding: a redirect loop. The dashboard layout
    // goes through the route that deletes the cookie; onboarding must too.
    (auth as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      OnboardingLayout({ children: <div />, params: Promise.resolve({ locale: "ar" }) }),
    ).rejects.toThrow("REDIRECT /api/auth/clear-stale-session?locale=ar");
  });
});