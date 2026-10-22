/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import AuthLayout from "@/app/[locale]/(auth)/layout";
import { OPEN_SETTINGS_EVENT } from "@/lib/consent/client";

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
// An async server component; the banner has its own test (responsiveVisualSystem).
jest.mock("@/components/shared/CookieConsentMount", () => ({ CookieConsentMount: () => null }));

const statementPublished = jest.fn().mockResolvedValue(false);
jest.mock("@/lib/cms/legalPageStatus", () => ({
  isLegalPagePublished: (slug: string) => statementPublished(slug),
}));

jest.mock("@/components/shared/AccessibilityPanel", () => ({
  AccessibilityPanel: ({ locale, statementPublished }: { locale: string; statementPublished: boolean }) => (
    <button type="button" data-testid="a11y-panel">
      {locale}:{statementPublished ? "statement" : "no-statement"}
    </button>
  ),
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
      privacy: "Privacy",
      cookies: "Cookies",
      cookieSettings: "Cookie settings",
      legalLinks: "Privacy and cookies",
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

  it("always offers the accessibility panel, linking the statement only once it is published", async () => {
    const renderLayout = async () =>
      render(await AuthLayout({ children: <div>Login form</div>, params: Promise.resolve({ locale: "en" }) }));

    const { unmount } = await renderLayout();
    expect(screen.getByTestId("a11y-panel")).toHaveTextContent("en:no-statement");
    unmount();

    statementPublished.mockResolvedValueOnce(true);
    await renderLayout();
    expect(screen.getByTestId("a11y-panel")).toHaveTextContent("en:statement");
    expect(statementPublished).toHaveBeenCalledWith("accessibility-statement");
  });

  // Final review M3: the banner promises "change this any time in Cookie settings", but sign-in and
  // sign-up had no way to reach them, so withdrawing meant leaving the flow.
  it("offers Privacy, the Cookie Policy and Cookie settings under the form, each a 44px target on phones", async () => {
    const opened = jest.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, opened);
    render(await AuthLayout({ children: <div>Register form</div>, params: Promise.resolve({ locale: "ar" }) }));

    const legal = screen.getByRole("navigation", { name: "Privacy and cookies" });
    expect(screen.getByRole("main")).not.toContainElement(legal);
    expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/ar/privacy");
    expect(within(legal).getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/ar/cookies");
    const settings = within(legal).getByRole("button", { name: "Cookie settings" });
    for (const target of [...within(legal).getAllByRole("link"), settings]) {
      expect(target).toHaveClass("min-h-11");
    }
    fireEvent.click(settings);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_SETTINGS_EVENT, opened);
  });
});