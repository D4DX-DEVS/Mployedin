/**
 * @jest-environment jsdom
 *
 * The display currency is a preference: remembered on the device while
 * preferences are allowed (no choice yet, or accepted), for the tab only once
 * the visitor objected.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { writeConsent } from "@/lib/consent/client";

const KEY = "mployedin_display_currency";
const fetchMock = jest.fn();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "mpl_consent=; Max-Age=0; path=/";
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ currencyCode: "USD" }) });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe("useCurrencyPreference", () => {
  // The server renders the fallback, so the browser's first render must match it; storage is read in an effect.
  it("renders the default on the first pass and reads storage in an effect", async () => {
    localStorage.setItem(KEY, "EUR");
    const seen: string[] = [];

    const { result } = renderHook(() => {
      const preference = useCurrencyPreference();
      seen.push(preference.displayCurrency);
      return preference;
    });

    expect(seen[0]).toBe("AED");
    await waitFor(() => expect(result.current.displayCurrency).toBe("EUR"));
    expect(seen[seen.length - 1]).toBe("EUR");
  });

  it("renders the default on the first pass when only the tab holds a choice, too", async () => {
    writeConsent({ preferences: false, media: false });
    sessionStorage.setItem(KEY, "GBP");
    const seen: string[] = [];

    const { result } = renderHook(() => {
      const preference = useCurrencyPreference();
      seen.push(preference.displayCurrency);
      return preference;
    });

    expect(seen[0]).toBe("AED");
    await waitFor(() => expect(result.current.displayCurrency).toBe("GBP"));
  });

  it("remembers a chosen currency on the device while preferences are allowed", async () => {
    localStorage.setItem(KEY, "AED");
    const { result } = renderHook(() => useCurrencyPreference());
    act(() => result.current.setDisplayCurrency("GBP"));

    expect(localStorage.getItem(KEY)).toBe("GBP");
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("keeps it for the tab only after preferences were objected to", async () => {
    writeConsent({ preferences: false, media: false });
    const { result } = renderHook(() => useCurrencyPreference());
    act(() => result.current.setDisplayCurrency("GBP"));

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBe("GBP");
    expect(result.current.displayCurrency).toBe("GBP");
  });

  it("reads the saved currency back without asking the server", async () => {
    writeConsent({ preferences: false, media: false });
    sessionStorage.setItem(KEY, "EUR");
    const { result } = renderHook(() => useCurrencyPreference());

    await waitFor(() => expect(result.current.displayCurrency).toBe("EUR"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with nothing saved, starts from the account's currency and remembers it the same way", async () => {
    writeConsent({ preferences: false, media: false });
    const { result } = renderHook(() => useCurrencyPreference());

    await waitFor(() => expect(result.current.displayCurrency).toBe("USD"));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBe("USD");
  });
});
