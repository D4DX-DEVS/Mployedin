/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import OnboardingLayout from "@/app/[locale]/(onboarding)/layout";

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "u1", role: "job_seeker" } }),
}));

jest.mock("@/components/shared/SessionWrapper", () => ({
  SessionWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/shared/CsrfProvider", () => ({
  CsrfProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/shared/PublicFooter", () => ({
  __esModule: true,
  default: ({ locale, variant }: { locale: string; variant: string }) => (
    <footer data-testid="public-footer">
      {locale}:{variant}
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
    expect(screen.getByTestId("public-footer")).toHaveTextContent("en:embedded");
  });
});