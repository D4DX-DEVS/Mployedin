/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CookieConsent from "@/components/shared/CookieConsent";

const mockTranslations: Record<string, string> = {
  "landing.cookieConsent": "We use cookies to improve your experience.",
  "landing.cookiePolicy": "Cookie policy",
  "landing.cookieDecline": "Decline",
  "landing.cookieAccept": "Accept",
};

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) =>
    (key: string, values?: Record<string, string | number>) => {
      const template = mockTranslations[`${namespace}.${key}`] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{${name}}`, String(value)),
        template,
      );
    },
}));

describe("responsive visual system", () => {
  afterEach(() => {
    jest.useRealTimers();
    window.localStorage.clear();
    delete document.documentElement.dataset.cookieBanner;
  });

  it("reserves document clearance while the compact cookie banner is visible", () => {
    jest.useFakeTimers();
    render(<CookieConsent locale="en" />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("region", { name: "Cookie policy" })).toBeInTheDocument();
    expect(document.documentElement.dataset.cookieBanner).toBe("visible");
    expect(screen.getByRole("button", { name: "Accept" })).toHaveClass("min-h-11");

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(document.documentElement.dataset.cookieBanner).toBeUndefined();
  });
});
