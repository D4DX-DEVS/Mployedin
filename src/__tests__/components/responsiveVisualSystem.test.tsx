/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CookieConsent from "@/components/shared/CookieConsent";
import { SmartHeader } from "@/components/features/employer/dashboard/SmartHeader";

const mockTranslations: Record<string, string> = {
  "consent.bannerTitle": "Your privacy choices",
  "consent.acceptAll": "Accept all",
  "consent.rejectAll": "Reject all",
  "consent.customize": "Customise",
  "employerDashboard.smartHeader.aiMatchesFound": "AI matches found",
  "employerDashboard.smartHeader.subtitleAiMatches": "AI found {count} matches.",
  "employerDashboard.smartHeader.welcomeBack": "Welcome back, {userName}",
  "employerDashboard.smartHeader.lastActivity": "Last activity {time}",
  "employerDashboard.smartHeader.freshWorkspace": "Fresh workspace",
  "employerDashboard.smartHeader.createJob": "Create Job with AI",
  "employerDashboard.smartHeader.createJobShort": "Create job",
  "employerDashboard.smartHeader.justNow": "just now",
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

  it("keeps the Employer primary action visibly labelled on phones", () => {
    render(
      <SmartHeader
        userName="Employer"
        newApplications={2}
        scheduledInterviews={0}
        activeJobCount={1}
        highMatchCount={3}
        lastActivityMinutes={0}
        locale="en"
      />,
    );

    const compactLabel = screen.getByText("Create job");
    expect(compactLabel).toHaveClass("sm:hidden");
    expect(compactLabel.closest("a")).toHaveAttribute("aria-label", "Create Job with AI");
    expect(compactLabel.closest("a")).toHaveClass("min-h-11");
  });

  it("reserves document clearance while the cookie banner is visible", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ consent: null }) }),
    ) as unknown as typeof fetch;
    render(<CookieConsent locale="en" />);

    expect(await screen.findByRole("region", { name: "Your privacy choices" })).toBeInTheDocument();
    expect(document.documentElement.dataset.cookieBanner).toBe("visible");
    expect(screen.getByRole("button", { name: "Accept all" })).toHaveClass("min-h-11");

    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    await waitFor(() => expect(document.documentElement.dataset.cookieBanner).toBeUndefined());
  });
});
