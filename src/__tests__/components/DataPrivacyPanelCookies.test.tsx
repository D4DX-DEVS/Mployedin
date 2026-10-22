/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient, fireEvent, renderWithProviders, screen } from "@/test-utils";
import { DataPrivacyPanel } from "@/components/features/privacy/DataPrivacyPanel";
import { dataPrivacyKeys } from "@/hooks/useDataPrivacy";
import { OPEN_SETTINGS_EVENT, writeConsent } from "@/lib/consent/client";
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent/state";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const fetchMock = jest.fn();

beforeEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    if (url === "/api/gdpr/requests") return { ok: true, json: async () => ({ requests: [] }) };
    if (url === "/api/user/consent") {
      return {
        ok: true,
        json: async () => ({ consents: { terms_and_privacy: null, cookies: { granted: true, at: "2026-01-01T00:00:00.000Z", source: "cookie_banner" } } }),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("DataPrivacyPanel cookies", () => {
  it("opens Cookie settings instead of offering its own Accept/Decline pair", async () => {
    const opened = jest.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, opened);
    renderWithProviders(<DataPrivacyPanel />);

    const button = await screen.findByRole("button", { name: "Cookie settings" });
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_SETTINGS_EVENT, opened);
    // It no longer writes to the account log itself; the receipt route does.
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("shows this browser's choice, not the account's last log row", async () => {
    renderWithProviders(<DataPrivacyPanel />);
    // The log says "accepted", but this browser has no choice yet.
    expect(await screen.findByText("You haven't chosen yet.")).toBeInTheDocument();
  });

  it("says what was chosen for each category, with the date, instead of Accepted or Declined", async () => {
    const stored = writeConsent({ preferences: true, media: false });
    renderWithProviders(<DataPrivacyPanel />);

    expect(await screen.findByText("Display settings: remembered · Videos: off")).toBeInTheDocument();
    expect(screen.getByText(`Chosen on ${new Date(stored.at).toISOString()}`)).toBeInTheDocument();
    expect(screen.queryByText(/^Accepted on/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Declined on/)).not.toBeInTheDocument();
  });

  it.each([
    [{ preferences: false, media: false }, "Display settings: not remembered · Videos: off"],
    [{ preferences: false, media: true }, "Display settings: not remembered · Videos: allowed"],
    [{ preferences: true, media: true }, "Display settings: remembered · Videos: allowed"],
  ])("reads %j from the consent cookie", async (choice, line) => {
    writeConsent(choice);
    renderWithProviders(<DataPrivacyPanel />);
    expect(await screen.findByText(line)).toBeInTheDocument();
  });

  it("still shows the choice, without a date line, when the cookie's date is unreadable", async () => {
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent({ v: 1, id: "abc", preferences: true, media: false, at: "not-a-date" })}; Path=/`;
    renderWithProviders(<DataPrivacyPanel />);

    expect(await screen.findByText("Display settings: remembered · Videos: off")).toBeInTheDocument();
    expect(screen.queryByText(/^Chosen on/)).not.toBeInTheDocument();
  });

  it("never shows 'You haven't chosen yet' on the first pass, before the cookie has been read", () => {
    // The first client render (and the server's) has no choice in state yet: the
    // account data can already be cached, so the row is on screen by then.
    writeConsent({ preferences: true, media: false });
    const client = createTestQueryClient();
    client.setQueryData(dataPrivacyKeys.consents(), { terms_and_privacy: null, cookies: null });
    client.setQueryData(dataPrivacyKeys.requests(), []);

    const firstPass = renderToString(
      <QueryClientProvider client={client}>
        <DataPrivacyPanel />
      </QueryClientProvider>,
    );

    expect(firstPass).toContain("Cookies");
    expect(firstPass).not.toMatch(/chosen yet/);
    expect(firstPass).not.toMatch(/Display settings:/);
  });

  it("shows the choice (not the placeholder) once mounted when the account data is already cached", async () => {
    writeConsent({ preferences: false, media: true });
    const client = createTestQueryClient();
    client.setQueryData(dataPrivacyKeys.consents(), { terms_and_privacy: null, cookies: null });
    client.setQueryData(dataPrivacyKeys.requests(), []);
    const { render } = await import("@testing-library/react");
    render(
      <QueryClientProvider client={client}>
        <DataPrivacyPanel />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Display settings: not remembered · Videos: allowed")).toBeInTheDocument();
    expect(screen.queryByText("You haven't chosen yet.")).not.toBeInTheDocument();
  });
});
