/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CookieConsent, { type CookieConsentLabels } from "@/components/shared/CookieConsent";
import { SmartHeader } from "@/components/features/employer/dashboard/SmartHeader";
import { CONSENT_COOKIE } from "@/lib/consent/state";

// The banner posts a receipt after a choice; no network in this test.
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: jest.fn().mockResolvedValue({ ok: true }) }));

const cookieLabels: CookieConsentLabels = {
  message: "We use cookies.",
  policy: "Cookie policy",
  rejectAll: "Reject all",
  acceptAll: "Accept all",
  customise: "Customise",
  settings: {
    title: "Cookie settings",
    description: "Choose.",
    necessaryTitle: "Strictly necessary",
    necessaryDescription: "Needed.",
    alwaysOn: "Always on",
    preferencesTitle: "Remember my display settings",
    preferencesDescription: "Display settings.",
    preferencesIfOff: "If off: this visit only.",
    preferencesUndo: "Nothing leaves your device.",
    mediaTitle: "Videos from YouTube",
    mediaDescription: "Videos.",
    mediaIfOff: "If off: no videos.",
    mediaUndo: "Can't recall.",
    mediaGoogleControls: "Google controls",
    reference: "Your choice reference",
    save: "Save choices",
    showCovered: "Show what this covers",
    hideCovered: "Hide",
  },
  items: {},
};

const mockTranslations: Record<string, string> = {
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
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
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

  it("reserves document clearance while the compact cookie banner is visible", async () => {
    render(<CookieConsent locale="en" labels={cookieLabels} />);

    // Shown on first paint now: no timer to wait for.
    expect(screen.getByRole("region", { name: "Cookie settings" })).toBeInTheDocument();
    expect(document.documentElement.dataset.cookieBanner).toBe("visible");
    for (const name of ["Reject all", "Accept all", "Customise"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("min-h-11");
    }

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    });
    await waitFor(() => expect(document.documentElement.dataset.cookieBanner).toBeUndefined());
  });
});
