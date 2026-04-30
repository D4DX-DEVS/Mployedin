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

jest.mock("@/components/shared/ThemeToggle", () => ({
  ThemeToggle: () => <button aria-label="theme-toggle">Theme</button>,
}));

describe("AuthLayout", () => {
  it("renders the shared theme toggle above auth pages", async () => {
    render(
      await AuthLayout({
        children: <div>Login form</div>,
        params: Promise.resolve({ locale: "en" }),
      })
    );

    expect(screen.getByRole("button", { name: /theme-toggle/i })).toBeInTheDocument();
    expect(screen.getByText("Login form")).toBeInTheDocument();
  });
});