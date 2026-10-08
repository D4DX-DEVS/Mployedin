/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import CookieConsent from "@/components/shared/CookieConsent";
import { CONSENT_COOKIE, CONSENT_OPEN_EVENT, CONSENT_POLICY_VERSION, parseConsent } from "@/lib/consent/config";

expect.extend(toHaveNoViolations);

const fetchMock = jest.fn();

function readConsentCookie() {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(hit?.slice(CONSENT_COOKIE.length + 1));
}

function clearCookies() {
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

beforeEach(() => {
  clearCookies();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(init?.method === "POST" ? { ok: true } : { consent: null }),
    }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
});

async function renderBanner() {
  const view = render(<CookieConsent locale="en" />);
  await screen.findByRole("region", { name: "Your privacy choices" });
  return view;
}

describe("CookieConsent", () => {
  it("offers Reject all and Accept all with equal prominence on the first layer", async () => {
    await renderBanner();
    const reject = screen.getByRole("button", { name: "Reject all" });
    const accept = screen.getByRole("button", { name: "Accept all" });
    expect(reject.className).toBe(accept.className);
    expect(screen.getByRole("button", { name: "Customise" })).toBeInTheDocument();
    expect(document.documentElement.dataset.cookieBanner).toBe("visible");
  });

  it("stores a refusal, records it, and hides the banner", async () => {
    await renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
    expect(readConsentCookie()).toMatchObject({
      method: "reject_all",
      choices: { functional: false, analytics: false, marketing: false },
    });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Your privacy choices" })).toBeNull());
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall?.[0]).toBe("/api/consent");
    expect(JSON.parse(postCall?.[1].body)).toMatchObject({ method: "reject_all" });
  });

  it("has no optional category pre-ticked in the preferences dialog", async () => {
    await renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "Customise" }));
    const dialog = await screen.findByRole("dialog");
    const switches = within(dialog).getAllByRole("switch");
    const [necessary, ...optional] = switches;
    expect(necessary).toBeDisabled();
    expect(necessary).toHaveAttribute("aria-checked", "true");
    optional.forEach((s) => expect(s).toHaveAttribute("aria-checked", "false"));

    fireEvent.click(within(dialog).getByRole("switch", { name: "Analytics" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save my choices" }));
    expect(readConsentCookie()).toMatchObject({
      method: "custom",
      choices: { functional: false, analytics: true, marketing: false },
    });
  });

  it("can be reopened from anywhere to change or withdraw the choice", async () => {
    await renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Your privacy choices" })).toBeNull());

    act(() => {
      window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("switch", { name: "Analytics" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject all" }));
    expect(readConsentCookie()).toMatchObject({ method: "withdraw", choices: { analytics: false } });
  });

  it("honours Global Privacy Control on accept all", async () => {
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true });
    try {
      await renderBanner();
      expect(screen.getByText(/Global Privacy Control/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
      expect(readConsentCookie()).toMatchObject({ gpc: true, choices: { analytics: true, marketing: false } });
    } finally {
      delete (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl;
    }
  });

  it("adopts the account's choice from another device instead of asking again", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            consent: {
              id: "0f8fad5b-d9cb-469f-a165-70867728950e",
              version: CONSENT_POLICY_VERSION,
              timestamp: Date.now(),
              choices: { functional: true, analytics: false, marketing: false },
              method: "custom",
              gpc: false,
            },
          }),
      }),
    );
    render(<CookieConsent locale="en" />);
    await waitFor(() => expect(readConsentCookie()).toMatchObject({ choices: { functional: true } }));
    expect(screen.queryByRole("region", { name: "Your privacy choices" })).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = await renderBanner();
    expect(await axe(document.body)).toHaveNoViolations();
    expect(container).toBeDefined();
  });
});
