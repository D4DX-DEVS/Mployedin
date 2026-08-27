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

jest.mock("next-intl/server", () => ({
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