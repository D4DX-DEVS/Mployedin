/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CookieConsent, { type CookieConsentLabels } from "@/components/shared/CookieConsent";
import { CHOICE_BUTTON_CLASS } from "@/components/shared/ConsentManager/CookieSettingsDialog";
import { CookieSettingsLink } from "@/components/shared/ConsentManager/CookieSettingsLink";
import { YouTubeFacade } from "@/components/shared/ConsentManager/YouTubeFacade";
import { CONSENT_EVENT, OPEN_SETTINGS_EVENT, readConsent, withdrawCleanup, writeConsent } from "@/lib/consent/client";
import { RECEIPT_PENDING_KEY } from "@/lib/consent/pendingReceipt";
import { CONSENT_COOKIE } from "@/lib/consent/state";
import { purposeKeys } from "@/lib/consent/copy";

const csrfFetchMock = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetchMock(...args),
}));

const getConsentMock = jest.fn();
jest.mock("@/lib/consent/server", () => ({ getConsent: () => getConsentMock() }));

// The real cleanup runs; the wrapper only records that the dialog called it.
jest.mock("@/lib/consent/client", () => {
  const actual = jest.requireActual("@/lib/consent/client");
  return { ...actual, withdrawCleanup: jest.fn(actual.withdrawCleanup) };
});

const labels: CookieConsentLabels = {
  message: "We use cookies.",
  policy: "Cookie Policy",
  rejectAll: "Reject all",
  acceptAll: "Accept all",
  customise: "Customise",
  settings: {
    title: "Cookie settings",
    description: "Choose what this site may store.",
    necessaryTitle: "Strictly necessary",
    necessaryDescription: "Needed for the site to work.",
    alwaysOn: "Always on",
    preferencesTitle: "Remember my display settings",
    preferencesDescription: "Language, currency and accessibility.",
    preferencesIfOff: "If off: settings last for this visit only.",
    preferencesUndo: "Nothing leaves your device.",
    mediaTitle: "Videos from YouTube",
    mediaDescription: "Lets videos play.",
    mediaIfOff: "If off: videos don't load.",
    mediaUndo: "Turning this off can't recall what YouTube already received.",
    mediaGoogleControls: "Manage your data with Google",
    reference: "Your choice reference",
    save: "Save choices",
    showCovered: "Show what this covers",
    hideCovered: "Hide",
  },
  items: Object.fromEntries(purposeKeys().map((key) => [key, `item:${key}`])),
};

function clearConsentCookie() {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
}

function lastReceiptBody(): Record<string, unknown> {
  const call = csrfFetchMock.mock.calls.at(-1) as [string, RequestInit];
  expect(call[0]).toBe("/api/consent/receipt");
  expect(call[1].method).toBe("POST");
  return JSON.parse(String(call[1].body));
}

describe("CookieConsent banner", () => {
  beforeEach(() => {
    clearConsentCookie();
    window.localStorage.clear();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
    (withdrawCleanup as jest.Mock).mockClear();
  });

  afterEach(() => {
    delete document.documentElement.dataset.cookieBanner;
  });

  it("shows straight away when no choice is stored (no delay)", () => {
    jest.useFakeTimers();
    try {
      render(<CookieConsent locale="en" labels={labels} />);
      // No timer is advanced: the banner must already be there.
      expect(screen.getByRole("region", { name: "Cookie settings" })).toBeInTheDocument();
      expect(document.documentElement.dataset.cookieBanner).toBe("visible");
    } finally {
      jest.useRealTimers();
    }
  });

  it("offers Reject all, Accept all and Customise, with Reject and Accept styled the same", () => {
    render(<CookieConsent locale="en" labels={labels} />);
    const banner = screen.getByRole("region", { name: "Cookie settings" });
    const reject = within(banner).getByRole("button", { name: "Reject all" });
    const accept = within(banner).getByRole("button", { name: "Accept all" });
    const customise = within(banner).getByRole("button", { name: "Customise" });

    expect(reject.className).toBe(accept.className);
    expect(reject).toHaveClass("min-h-11");
    expect(customise.className).not.toBe(accept.className);
    // Tab order follows the DOM: Reject, Accept, Customise.
    const order = within(banner).getAllByRole("button").map((b) => b.textContent);
    expect(order).toEqual(["Reject all", "Accept all", "Customise"]);
  });

  it("names the banner region Cookie settings, not after the Cookie Policy link inside it", () => {
    render(<CookieConsent locale="en" labels={labels} />);
    const banner = screen.getByRole("region", { name: "Cookie settings" });
    expect(within(banner).getByRole("link", { name: "Cookie Policy" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Cookie Policy" })).not.toBeInTheDocument();
  });

  describe("keyboard focus after a choice", () => {
    const withMain = () =>
      render(
        <>
          <main id="main-content">
            <p>Page</p>
          </main>
          <CookieConsent locale="en" labels={labels} />
        </>,
      );

    it("moves to the main content after Reject all, not to <body> (the banner and its buttons are gone)", async () => {
      withMain();
      const reject = screen.getByRole("button", { name: "Reject all" });
      reject.focus();
      fireEvent.click(reject);

      const main = document.getElementById("main-content")!;
      await waitFor(() => expect(document.activeElement).toBe(main));
      expect(main).toHaveAttribute("tabindex", "-1");
    });

    it("moves to the main content after saving in the dialog opened from the banner's Customise", async () => {
      withMain();
      fireEvent.click(screen.getByRole("button", { name: "Customise" }));
      const dialog = screen.getByRole("dialog", { name: "Cookie settings" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Save choices" }));

      await waitFor(() => expect(document.activeElement).toBe(document.getElementById("main-content")));
    });

    it("leaves focus alone when it is still on something on the page", async () => {
      render(
        <>
          <main id="main-content">
            <button type="button">Elsewhere</button>
          </main>
          <CookieConsent locale="en" labels={labels} />
        </>,
      );
      const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
      fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
      elsewhere.focus();

      await waitFor(() => expect(screen.queryByRole("region", { name: "Cookie settings" })).not.toBeInTheDocument());
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(document.activeElement).toBe(elsewhere);
    });
  });

  it("puts Reject all and Accept all alone in a two-column grid, so they are always the same width (equal prominence)", () => {
    render(<CookieConsent locale="en" labels={labels} />);
    const banner = screen.getByRole("region", { name: "Cookie settings" });
    const reject = within(banner).getByRole("button", { name: "Reject all" });
    const accept = within(banner).getByRole("button", { name: "Accept all" });
    const customise = within(banner).getByRole("button", { name: "Customise" });
    const pair = reject.parentElement!;
    expect(accept.parentElement).toBe(pair);
    expect(pair).toHaveClass("grid", "grid-cols-2");
    expect(Array.from(pair.children)).toEqual([reject, accept]);
    expect(pair).not.toContainElement(customise);
  });

  it("Reject all stores both optional categories off, posts a receipt and hides", async () => {
    render(<CookieConsent locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject all" }));

    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    const stored = readConsent();
    expect(stored).toMatchObject({ preferences: false, media: false });
    expect(lastReceiptBody()).toEqual({
      receiptId: stored!.id,
      preferences: false,
      media: false,
      version: 1,
      locale: "en",
      source: "banner",
    });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Cookie settings" })).not.toBeInTheDocument());
    expect(document.documentElement.dataset.cookieBanner).toBeUndefined();
  });

  it("Accept all stores both optional categories on", async () => {
    render(<CookieConsent locale="ar" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));

    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    expect(readConsent()).toMatchObject({ preferences: true, media: true });
    expect(lastReceiptBody()).toMatchObject({ preferences: true, media: true, locale: "ar" });
  });

  it("Customise opens the dialog with Preferences on and Media off, necessary locked on", () => {
    render(<CookieConsent locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Customise" }));

    const dialog = screen.getByRole("dialog", { name: "Cookie settings" });
    expect(within(dialog).getByRole("switch", { name: "Remember my display settings" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("switch", { name: "Videos from YouTube" })).toHaveAttribute("aria-checked", "false");
    const necessary = within(dialog).getByRole("switch", { name: "Strictly necessary" });
    expect(necessary).toHaveAttribute("aria-checked", "true");
    expect(necessary).toBeDisabled();

    // Strictly necessary is itemised from REGISTRY, one line per purpose (behind a disclosure).
    fireEvent.click(within(dialog).getByRole("button", { name: /^Show what this covers/ }));
    const necessaryList = within(dialog).getByRole("list", { name: "Strictly necessary" });
    for (const key of purposeKeys("necessary")) {
      expect(within(necessaryList).getByText(`item:${key}`)).toBeInTheDocument();
    }
    expect(within(necessaryList).queryByText("item:youtube")).not.toBeInTheDocument();
    expect(within(necessaryList).getAllByRole("listitem")).toHaveLength(purposeKeys("necessary").length);

    // Each optional category says what happens when it is off and what can't be undone.
    expect(within(dialog).getByText("If off: settings last for this visit only.")).toBeInTheDocument();
    expect(within(dialog).getByText("If off: videos don't load.")).toBeInTheDocument();
    expect(within(dialog).getByText(/can't recall what YouTube already received/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Manage your data with Google/ })).toHaveAttribute("rel", "noopener noreferrer");

    // No choice yet, so no reference to quote.
    expect(within(dialog).queryByText("Your choice reference:")).not.toBeInTheDocument();

    const reject = within(dialog).getByRole("button", { name: "Reject all" });
    const accept = within(dialog).getByRole("button", { name: "Accept all" });
    expect(reject.className).toBe(accept.className);
  });

  it("Save choices from Customise stores the switches as shown and records the settings source", async () => {
    render(<CookieConsent locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Customise" }));
    const dialog = screen.getByRole("dialog", { name: "Cookie settings" });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Videos from YouTube" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save choices" }));

    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    expect(readConsent()).toMatchObject({ preferences: true, media: true });
    expect(lastReceiptBody()).toMatchObject({ preferences: true, media: true, source: "settings" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Cookie settings" })).not.toBeInTheDocument();
  });

  it("closing the dialog without saving stores nothing and keeps the banner", async () => {
    render(<CookieConsent locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Customise" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(readConsent()).toBeNull();
    expect(csrfFetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Cookie settings" })).toBeInTheDocument();
  });

  it("ignores the legacy localStorage cookie-consent answer (the banner still shows)", () => {
    window.localStorage.setItem("cookie-consent", "accepted");
    render(<CookieConsent locale="en" labels={labels} />);
    expect(screen.getByRole("region", { name: "Cookie settings" })).toBeInTheDocument();
  });

  it("stays hidden when a choice is stored, even if the server rendered it", () => {
    writeConsent({ preferences: true, media: false });
    render(<CookieConsent locale="en" labels={labels} initiallyVisible />);
    expect(screen.queryByRole("region", { name: "Cookie settings" })).not.toBeInTheDocument();
  });

  it("the Cookie settings link opens the dialog after a choice and shows the choice reference", () => {
    const stored = writeConsent({ preferences: true, media: false });
    render(
      <>
        <CookieConsent locale="en" labels={labels} />
        <CookieSettingsLink>Cookie settings</CookieSettingsLink>
      </>,
    );
    expect(screen.queryByRole("region", { name: "Cookie settings" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cookie settings" }));
    const dialog = screen.getByRole("dialog", { name: "Cookie settings" });
    expect(within(dialog).getByText("Your choice reference:")).toBeInTheDocument();
    expect(within(dialog).getByText(stored.id)).toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: "Remember my display settings" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("switch", { name: "Videos from YouTube" })).toHaveAttribute("aria-checked", "false");
  });

  it("withdrawing Preferences through the dialog runs withdrawCleanup and clears preference storage", async () => {
    const prev = writeConsent({ preferences: true, media: true });
    window.localStorage.setItem("ui:setup-guide", "dismissed");
    render(
      <>
        <CookieConsent locale="en" labels={labels} />
        <CookieSettingsLink>Cookie settings</CookieSettingsLink>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cookie settings" }));
    const dialog = screen.getByRole("dialog", { name: "Cookie settings" });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Remember my display settings" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save choices" }));

    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    expect(withdrawCleanup).toHaveBeenCalledTimes(1);
    const [cleanupPrev, cleanupNext] = (withdrawCleanup as jest.Mock).mock.calls[0];
    expect(cleanupPrev).toMatchObject({ id: prev.id, preferences: true });
    expect(cleanupNext).toMatchObject({ preferences: false, media: true });
    expect(window.localStorage.getItem("ui:setup-guide")).toBeNull();
    expect(lastReceiptBody()).toMatchObject({ preferences: false, media: true, source: "settings" });
  });

  it("renders no hidden form inputs for its switches (the Radix RTL overflow trap)", () => {
    render(
      <div dir="rtl">
        <CookieConsent locale="ar" labels={labels} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Customise" }));
    expect(screen.getAllByRole("switch")).toHaveLength(3);
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("does not throw when the receipt request fails (fire-and-forget)", async () => {
    csrfFetchMock.mockRejectedValue(new Error("offline"));
    render(<CookieConsent locale="en" labels={labels} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
    });
    expect(readConsent()).toMatchObject({ preferences: false, media: false });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Cookie settings" })).not.toBeInTheDocument());
  });
});

describe("Cookie settings: the Strictly necessary disclosure", () => {
  const covered = purposeKeys("necessary").length;

  beforeEach(() => {
    clearConsentCookie();
    window.localStorage.clear();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
  });

  afterEach(() => {
    delete document.documentElement.dataset.cookieBanner;
  });

  function openDialog() {
    render(<CookieConsent locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Customise" }));
    return screen.getByRole("dialog", { name: "Cookie settings" });
  }

  it("starts collapsed, with the title, description and Always on still showing", () => {
    const dialog = openDialog();
    const toggle = within(dialog).getByRole("button", { name: `Show what this covers (${covered})` });

    expect(covered).toBeGreaterThan(10);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const controlled = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(controlled).toBeInTheDocument();
    expect(controlled).not.toBeVisible();
    expect(within(dialog).queryByRole("list", { name: "Strictly necessary" })).not.toBeInTheDocument();

    expect(within(dialog).getByText("Strictly necessary")).toBeVisible();
    expect(within(dialog).getByText("Needed for the site to work.")).toBeVisible();
    expect(within(dialog).getByText("Always on")).toBeVisible();
  });

  it("opens and closes the itemised list, with aria-expanded following and the label flipping to Hide", () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: `Show what this covers (${covered})` }));

    const hide = within(dialog).getByRole("button", { name: "Hide" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    const list = within(dialog).getByRole("list", { name: "Strictly necessary" });
    expect(list).toBeVisible();
    expect(list.id).toBe(hide.getAttribute("aria-controls"));
    expect(within(list).getAllByRole("listitem")).toHaveLength(covered);

    fireEvent.click(hide);
    expect(within(dialog).getByRole("button", { name: `Show what this covers (${covered})` })).toHaveAttribute("aria-expanded", "false");
    expect(list).not.toBeVisible();
  });

  it("only the Strictly necessary list is collapsible: the optional categories stay itemised", () => {
    const dialog = openDialog();

    expect(within(dialog).getAllByRole("button", { name: /^Show what this covers/ })).toHaveLength(1);
    const preferences = within(dialog).getByRole("list", { name: "Remember my display settings" });
    expect(within(preferences).getAllByRole("listitem")).toHaveLength(purposeKeys("preferences").length);
    expect(within(dialog).getByRole("list", { name: "Videos from YouTube" })).toBeVisible();
  });

  it("keeps Save, Reject all and Accept all in one footer that sticks to the bottom of the dialog at every size", () => {
    const dialog = openDialog();
    const footer = within(dialog).getByRole("button", { name: "Save choices" }).closest("[data-cookie-dialog-footer]");

    expect(footer).not.toBeNull();
    expect(footer).toContainElement(within(dialog).getByRole("button", { name: "Reject all" }));
    expect(footer).toContainElement(within(dialog).getByRole("button", { name: "Accept all" }));
    // Sticky on its own, not only below sm: at 1280x800 the dialog is taller than the window and its
    // scrollbar is hidden, so a footer at the end of the content would be cut off and "Reject all" would
    // need a scroll the visitor may not know about (ICO: rejecting must be as easy as accepting).
    expect(footer?.className).toMatch(/(?:^|\s)sticky(?:\s|$)/);
    expect(footer?.className).not.toContain("max-sm:sticky");
    // Flush with the dialog's bottom edge: pulled out by its own bottom padding (1rem/safe area on the phone
    // sheet, 1.5rem from sm), or scrolled text shows underneath.
    expect(footer?.className).toContain("bottom-[calc(-1*max(1rem,env(safe-area-inset-bottom)))]");
    expect(footer?.className).toContain("sm:-bottom-6");
    // Opaque with a top rule, so text scrolling behind it never shows through.
    expect(footer?.className).toMatch(/(?:^|\s)bg-background(?:\s|$)/);
    expect(footer?.className).toMatch(/(?:^|\s)border-t(?:\s|$)/);
    expect(footer?.className).toMatch(/(?:^|\s)z-10(?:\s|$)/);
  });

  it("keeps Reject all and Accept all identical: one shared class, variant and size", () => {
    const dialog = openDialog();
    const reject = within(dialog).getByRole("button", { name: "Reject all" });
    const accept = within(dialog).getByRole("button", { name: "Accept all" });

    expect(reject.className).toBe(accept.className);
    for (const token of CHOICE_BUTTON_CLASS.split(" ")) expect(reject).toHaveClass(token);
  });

  it("puts the dialog's Reject all and Accept all alone in a two-column grid inside the footer, Save outside it (equal width at every size)", () => {
    const dialog = openDialog();
    const reject = within(dialog).getByRole("button", { name: "Reject all" });
    const accept = within(dialog).getByRole("button", { name: "Accept all" });
    const save = within(dialog).getByRole("button", { name: "Save choices" });
    const pair = reject.parentElement!;
    expect(accept.parentElement).toBe(pair);
    expect(pair).toHaveClass("grid", "grid-cols-2");
    expect(Array.from(pair.children)).toEqual([reject, accept]);
    expect(pair).not.toContainElement(save);
    expect(pair.parentElement).toHaveAttribute("data-cookie-dialog-footer");
    expect(save.parentElement).toBe(pair.parentElement);
  });

  it("still saves from the footer", async () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save choices" }));

    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    expect(readConsent()).toMatchObject({ preferences: true, media: false });
  });
});

describe("CookieConsent receipt delivery", () => {
  const bannerRegion = () => screen.queryByRole("region", { name: "Cookie settings" });
  const bodyOfCall = (n: number) => JSON.parse(String((csrfFetchMock.mock.calls[n] as [string, RequestInit])[1].body));

  beforeEach(() => {
    jest.useFakeTimers();
    clearConsentCookie();
    window.localStorage.clear();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
    (withdrawCleanup as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete document.documentElement.dataset.cookieBanner;
  });

  it.each([[429], [500], [503]])("retries the receipt once, about 2 s later, after a %i", async (status) => {
    csrfFetchMock.mockResolvedValueOnce({ ok: false, status }).mockResolvedValueOnce({ ok: true, status: 204 });
    render(<CookieConsent locale="en" labels={labels} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
    });

    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    // The retry never holds the UI: the banner is gone before it fires.
    expect(bannerRegion()).not.toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(csrfFetchMock).toHaveBeenCalledTimes(2);
    // The same receipt, so the route stores the same choice.
    expect(bodyOfCall(1)).toEqual(bodyOfCall(0));
  });

  it("gives up after one retry", async () => {
    csrfFetchMock.mockResolvedValue({ ok: false, status: 429 });
    render(<CookieConsent locale="en" labels={labels} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(csrfFetchMock).toHaveBeenCalledTimes(2);
    expect(readConsent()).toMatchObject({ preferences: true, media: true });
  });

  it.each([[204], [400], [403]])("does not retry after a %i", async (status) => {
    csrfFetchMock.mockResolvedValue({ ok: status < 400, status });
    render(<CookieConsent locale="en" labels={labels} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
  });

  it("still retries when the visitor has already left the page", async () => {
    csrfFetchMock.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, status: 204 });
    const { unmount } = render(<CookieConsent locale="en" labels={labels} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
    });
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    expect(csrfFetchMock).toHaveBeenCalledTimes(2);
  });
});

/** The marker a failed delivery leaves is held back 30 s; this lets a test skip that wait without faking Date. */
function releaseHoldBack() {
  const marker = JSON.parse(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)!);
  window.sessionStorage.setItem(RECEIPT_PENDING_KEY, JSON.stringify({ ...marker, nextAt: 0 }));
}

function expectedMarkerHeldBack() {
  const marker = JSON.parse(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)!);
  expect(marker.nextAt).toBeGreaterThan(0);
}

describe("CookieConsent re-sends a receipt that could not be delivered", () => {
  beforeEach(() => {
    clearConsentCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
  });

  afterEach(() => {
    delete document.documentElement.dataset.cookieBanner;
  });

  it("sends the pending receipt for the stored choice when a page loads, then forgets it", async () => {
    // A failed delivery in this tab leaves the marker; the next page load mounts this component again.
    csrfFetchMock.mockResolvedValue({ ok: false, status: 500 });
    jest.useFakeTimers();
    try {
      const first = render(<CookieConsent locale="ar" labels={labels} />);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
      });
      await act(async () => {
        jest.advanceTimersByTime(2500);
      });
      first.unmount();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
    expect(csrfFetchMock).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).not.toBeNull();
    const choiceId = readConsent()!.id;
    expectedMarkerHeldBack();

    // Time passes: the 30 s hold-back is over by the next page load.
    releaseHoldBack();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
    await act(async () => {
      render(<CookieConsent locale="ar" labels={labels} />);
    });

    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(lastReceiptBody()).toMatchObject({ receiptId: choiceId, preferences: false, media: false, locale: "ar", source: "banner" });
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).toBeNull();
  });

  it("waits out the hold-back after a failed attempt: an immediate page load sends nothing", async () => {
    const state = writeConsent({ preferences: true, media: true });
    window.sessionStorage.setItem(
      RECEIPT_PENDING_KEY,
      JSON.stringify({ id: state.id, locale: "en", source: "banner", attempts: 1, nextAt: Date.now() + 30_000 }),
    );
    await act(async () => {
      render(<CookieConsent locale="en" labels={labels} />);
    });
    expect(csrfFetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).not.toBeNull();
  });

  it("sends the pending receipt when the browser comes back online, even inside the hold-back, and stops listening on unmount", async () => {
    const state = writeConsent({ preferences: true, media: true });
    window.sessionStorage.setItem(
      RECEIPT_PENDING_KEY,
      JSON.stringify({ id: state.id, locale: "en", source: "settings", attempts: 1, nextAt: Date.now() + 10 * 60_000 }),
    );
    const view = render(<CookieConsent locale="en" labels={labels} />);
    await act(async () => undefined);
    expect(csrfFetchMock).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(lastReceiptBody()).toMatchObject({ receiptId: state.id, source: "settings" });
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).toBeNull();

    view.unmount();
    window.sessionStorage.setItem(
      RECEIPT_PENDING_KEY,
      JSON.stringify({ id: state.id, locale: "en", source: "settings", attempts: 0, nextAt: 0 }),
    );
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes no request on a page load when nothing is pending", async () => {
    await act(async () => {
      render(<CookieConsent locale="en" labels={labels} />);
    });
    expect(csrfFetchMock).not.toHaveBeenCalled();
  });
});

describe("CookieConsent when clearing stored preferences fails", () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", onUnhandled);
    clearConsentCookie();
    window.localStorage.clear();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
    (withdrawCleanup as jest.Mock).mockReset();
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
    (withdrawCleanup as jest.Mock).mockImplementation(jest.requireActual("@/lib/consent/client").withdrawCleanup);
    delete document.documentElement.dataset.cookieBanner;
  });

  it("still hides the banner, keeps the stored choice and sends the receipt, with no unhandled rejection", async () => {
    (withdrawCleanup as jest.Mock).mockRejectedValue(new Error("storage blocked"));
    writeConsent({ preferences: true, media: true });
    render(<CookieConsent locale="en" labels={labels} />);
    expect(screen.queryByRole("region", { name: "Cookie settings" })).not.toBeInTheDocument();

    // Withdraw Preferences from the dialog: that is what runs the cleanup.
    act(() => {
      window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
    });
    const dialog = await screen.findByRole("dialog", { name: "Cookie settings" });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Remember my display settings" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save choices" }));
    });
    // Let any rejection surface.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(withdrawCleanup).toHaveBeenCalledTimes(1);
    expect(readConsent()).toMatchObject({ preferences: false, media: true });
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(unhandled).toEqual([]);
  });

  it("also hides the banner when Reject all hits the same failure", async () => {
    (withdrawCleanup as jest.Mock).mockRejectedValue(new Error("storage blocked"));
    render(<CookieConsent locale="en" labels={labels} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reject all" }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.queryByRole("region", { name: "Cookie settings" })).not.toBeInTheDocument();
    expect(readConsent()).toMatchObject({ preferences: false, media: false });
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(unhandled).toEqual([]);
  });
});

describe("CookieConsentMount", () => {
  beforeEach(() => {
    clearConsentCookie();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
  });

  afterEach(() => {
    delete document.documentElement.dataset.cookieBanner;
  });

  it("translates the banner and dialog on the server from the shared key list", async () => {
    getConsentMock.mockResolvedValue(null);
    const { CookieConsentMount } = await import("@/components/shared/CookieConsentMount");
    render(await CookieConsentMount({ locale: "en" }));

    expect(screen.getByText(/We use cookies that are needed to sign you in/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Customise" }));
    const dialog = screen.getByRole("dialog", { name: "Cookie settings" });
    expect(within(dialog).getByRole("switch", { name: "Remember my display settings" })).toBeInTheDocument();
    expect(within(dialog).getByText("Signing you in and keeping you signed in")).toBeInTheDocument();
  });

  it("passes the server's reading of mpl_consent as the first-paint state", async () => {
    const { CookieConsentMount } = await import("@/components/shared/CookieConsentMount");
    getConsentMock.mockResolvedValue(null);
    // The mount renders a fragment (StorageSweep next to the banner); the banner is the child that takes this prop.
    const banner = (tree: React.ReactElement) =>
      React.Children.toArray((tree.props as { children: React.ReactNode }).children).find(
        (child): child is React.ReactElement => React.isValidElement(child) && "initiallyVisible" in (child.props as object),
      );
    const undecided = await CookieConsentMount({ locale: "en" });
    expect((banner(undecided)?.props as { initiallyVisible: boolean }).initiallyVisible).toBe(true);

    getConsentMock.mockResolvedValue({ v: 1, id: "x", preferences: false, media: false, at: "" });
    const decided = await CookieConsentMount({ locale: "en" });
    expect((banner(decided)?.props as { initiallyVisible: boolean }).initiallyVisible).toBe(false);
  });
});

describe("CookieConsent and the pre-ui: preference keys on page load", () => {
  // Names older builds stored under; a visitor who objected before a page migrated one keeps it otherwise.
  const legacyKeys = [
    "copilot-fab-pos",
    "pwa-install-dismissed",
    "mployedin:setup-guide:dismissed",
    "sa_insights_dismissed",
    "mployedin.a11y.button",
    "cvBuilder.previewHidden",
  ];
  // Not preferences: an old data cache, and work in progress / a user-id-keyed dismissal that now live in the tab.
  const deviceCopies = [
    "mployedin_exchange_rates",
    "poster-edit:gen1",
    "mployedin:temp-password-notice-dismissed:user1",
  ];
  const seed = () => {
    [...legacyKeys, ...deviceCopies].forEach((key) => window.localStorage.setItem(key, "x"));
    window.localStorage.setItem("other-app", "1");
  };

  beforeEach(() => {
    clearConsentCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
  });

  it("deletes them on load when the stored choice has preferences off", () => {
    writeConsent({ preferences: false, media: false });
    seed();
    render(<CookieConsent locale="en" labels={labels} />);
    [...legacyKeys, ...deviceCopies].forEach((key) => expect(window.localStorage.getItem(key)).toBeNull());
    expect(window.localStorage.getItem("other-app")).toBe("1");
  });

  it("deletes the exchange-rate cache and the old poster / dismissal copies on load even when preferences were accepted", () => {
    writeConsent({ preferences: true, media: false });
    seed();
    window.sessionStorage.setItem("poster-edit:gen1", "tab copy");
    render(<CookieConsent locale="en" labels={labels} />);
    deviceCopies.forEach((key) => expect(window.localStorage.getItem(key)).toBeNull());
    // The tab's own copy (the current home of a poster draft) is not touched.
    expect(window.sessionStorage.getItem("poster-edit:gen1")).toBe("tab copy");
    expect(window.localStorage.getItem("other-app")).toBe("1");
  });

  it("deletes them on load when no choice was made yet", () => {
    seed();
    render(<CookieConsent locale="en" labels={labels} />);
    deviceCopies.forEach((key) => expect(window.localStorage.getItem(key)).toBeNull());
  });

  it("leaves them for each page to migrate when preferences were accepted", () => {
    writeConsent({ preferences: true, media: false });
    seed();
    render(<CookieConsent locale="en" labels={labels} />);
    legacyKeys.forEach((key) => expect(window.localStorage.getItem(key)).toBe("x"));
  });

  it("leaves them when no choice was made yet (preferences are allowed until the visitor objects)", () => {
    seed();
    render(<CookieConsent locale="en" labels={labels} />);
    legacyKeys.forEach((key) => expect(window.localStorage.getItem(key)).toBe("x"));
  });
});

describe("CookieConsent when a choice is written somewhere else", () => {
  const bannerRegion = () => screen.queryByRole("region", { name: "Cookie settings" });

  beforeEach(() => {
    clearConsentCookie();
    window.localStorage.clear();
    csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
    (withdrawCleanup as jest.Mock).mockClear();
  });

  afterEach(() => {
    delete document.documentElement.dataset.cookieBanner;
  });

  it("hides the open banner when another part of the page stores a choice", () => {
    render(<CookieConsent locale="en" labels={labels} />);
    expect(bannerRegion()).toBeInTheDocument();

    act(() => {
      writeConsent({ preferences: true, media: true });
    });

    expect(bannerRegion()).not.toBeInTheDocument();
    expect(document.documentElement.dataset.cookieBanner).toBeUndefined();
  });

  it("does not post a receipt of its own for a choice it did not make", () => {
    render(<CookieConsent locale="en" labels={labels} />);
    act(() => {
      writeConsent({ preferences: true, media: true });
    });
    // Whoever wrote the choice sends its receipt (recordConsentChoice); the banner must not double it.
    expect(csrfFetchMock).not.toHaveBeenCalled();
  });

  it("keeps the banner when the event arrives but no choice is stored (cookies blocked)", () => {
    render(<CookieConsent locale="en" labels={labels} />);
    act(() => {
      window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
    });
    expect(readConsent()).toBeNull();
    expect(bannerRegion()).toBeInTheDocument();
  });

  it("leaves the Cookie settings dialog open when the banner goes", () => {
    render(<CookieConsent locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Customise" }));
    expect(screen.getByRole("dialog", { name: "Cookie settings" })).toBeInTheDocument();

    act(() => {
      writeConsent({ preferences: true, media: true });
    });

    expect(bannerRegion()).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Cookie settings" })).toBeInTheDocument();
  });

  it("stops listening when it unmounts", () => {
    const removeSpy = jest.spyOn(window, "removeEventListener");
    const { unmount } = render(<CookieConsent locale="en" labels={labels} />);
    removeSpy.mockClear();
    unmount();
    const removed = removeSpy.mock.calls.map(([type]) => type);
    removeSpy.mockRestore();
    expect(removed).toContain(CONSENT_EVENT);
    expect(removed).toContain(OPEN_SETTINGS_EVENT);
  });

  it("closes the banner when the video placeholder's Always play videos is ticked, with one receipt", async () => {
    render(
      <>
        <CookieConsent locale="en" labels={labels} />
        <YouTubeFacade
          videoId="dQw4w9WgXcQ"
          title="How hiring works"
          locale="en"
          labels={{ play: "Play video", watchOnYoutube: "Watch on YouTube", notice: "Notice", always: "Always play videos" }}
        />
      </>,
    );
    expect(bannerRegion()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Always play videos" }));

    expect(bannerRegion()).not.toBeInTheDocument();
    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    expect(lastReceiptBody()).toMatchObject({ preferences: true, media: true, locale: "en", source: "settings" });
    expect(readConsent()).toMatchObject({ preferences: true, media: true });
  });
});
