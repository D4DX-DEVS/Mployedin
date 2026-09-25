/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import AuthLayout from "@/app/[locale]/(auth)/layout";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

// Pages in this group POST (join-team, verify-oauth-2fa), so they need the
// CSRF header the provider installs; without it join-team 403'd and invited
// colleagues could never create an account (audit 2026-09-24, ONB-12).
jest.mock("@/components/shared/CsrfProvider", () => ({
  CsrfProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="csrf-provider">{children}</div>,
}));

jest.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("next-intl/server", () => ({
  getMessages: async () => ({}),
  getTranslations: async () => (key: string, values?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      heading: "Localized auth marketing heading",
      description: "Localized auth marketing description",
      copyright: "© {year} MPLOYEDIN. Localized rights.",
    };

    return (messages[key] ?? key).replace("{year}", String(values?.year ?? ""));
  },
}));

describe("AuthLayout", () => {
  it("renders auth page children", async () => {
    render(
      await AuthLayout({
        children: <div>Login form</div>,
        params: Promise.resolve({ locale: "en" }),
      })
    );

    expect(screen.getByText("Login form")).toBeInTheDocument();
  });

  it("wraps the page in the CSRF provider", async () => {
    render(
      await AuthLayout({
        children: <div>Join team form</div>,
        params: Promise.resolve({ locale: "en" }),
      })
    );

    expect(screen.getByTestId("csrf-provider")).toContainElement(screen.getByText("Join team form"));
  });

  it("renders auth marketing copy from translations", async () => {
    render(
      await AuthLayout({
        children: <div>Login form</div>,
        params: Promise.resolve({ locale: "ar" }),
      })
    );

    expect(screen.getByText("Localized auth marketing heading")).toBeInTheDocument();
    expect(screen.getByText("Localized auth marketing description")).toBeInTheDocument();
    expect(screen.queryByText(/Elevate your hiring pipeline/i)).not.toBeInTheDocument();
  });
});