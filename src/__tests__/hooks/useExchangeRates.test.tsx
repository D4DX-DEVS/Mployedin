/**
 * @jest-environment jsdom
 *
 * Exchange rates are a data cache, not a preference, so they are kept in memory
 * for the visit and never read from or written to the device. The localStorage
 * copy an older build left behind is deleted on page load by the cookie
 * component (see CookieConsent.test.tsx and legacyKeys.test.ts), not by this hook.
 */
import * as React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AED_EXCHANGE_RATES } from "@/lib/currency";

type UseExchangeRates = typeof import("@/hooks/useExchangeRates").useExchangeRates;

const LEGACY_KEY = "mployedin_exchange_rates";
const LIVE = { AED: 1, GBP: 0.2, EUR: 0.25 };

/**
 * A fresh module registry stands in for a fresh page load: the hook keeps its
 * rates in a module-level variable, so without this one test's rates would be
 * the next test's starting point. The hook gets this file's copy of React, so
 * Testing Library's renderer and the hook agree.
 */
function loadHook(): UseExchangeRates {
  let hook!: UseExchangeRates;
  jest.isolateModules(() => {
    jest.doMock("react", () => React);
    hook = require("@/hooks/useExchangeRates").useExchangeRates;
  });
  return hook;
}

function respondWith(rates: Record<string, number>) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ rates, source: "live" }) });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  return fetchMock;
}
function neverRespond() {
  const fetchMock = jest.fn().mockReturnValue(new Promise(() => {}));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  return fetchMock;
}

let useExchangeRates: UseExchangeRates;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useExchangeRates = loadHook();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.dontMock("react");
});

describe("useExchangeRates", () => {
  it("starts from the static rates on the first render, before anything is read or fetched", () => {
    neverRespond();
    const seen: Array<{ source: string; isLoading: boolean; rates: Record<string, number> }> = [];

    renderHook(() => {
      const result = useExchangeRates();
      seen.push(result);
      return result;
    });

    expect(seen[0].source).toBe("static");
    expect(seen[0].isLoading).toBe(true);
    expect(seen[0].rates).toEqual(AED_EXCHANGE_RATES);
  });

  it("does not use a localStorage copy an older build left behind", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ rates: { AED: 1, USD: 9 }, storedAt: Date.now() }));
    const getItem = jest.spyOn(Storage.prototype, "getItem");
    neverRespond();

    const { result } = renderHook(() => useExchangeRates());
    await act(async () => {});

    expect(result.current.rates).toEqual(AED_EXCHANGE_RATES);
    expect(result.current.source).toBe("static");
    expect(getItem).not.toHaveBeenCalled();
  });

  it("never writes the rates to the device", async () => {
    respondWith(LIVE);
    const setItem = jest.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(() => useExchangeRates());
    await waitFor(() => expect(result.current.source).toBe("live"));

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(sessionStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("a later mount in the same visit starts from the in-memory copy", async () => {
    respondWith(LIVE);
    const first = renderHook(() => useExchangeRates());
    await waitFor(() => expect(first.result.current.source).toBe("live"));
    first.unmount();

    neverRespond();
    const second = renderHook(() => useExchangeRates());
    expect(second.result.current.rates).toEqual(LIVE);
    expect(second.result.current.source).toBe("cache");
    expect(second.result.current.isLoading).toBe(false);
  });

  it("starts empty again in a new test: the in-memory copy does not leak between page loads", () => {
    neverRespond();

    const { result } = renderHook(() => useExchangeRates());

    expect(result.current.rates).toEqual(AED_EXCHANGE_RATES);
    expect(result.current.source).toBe("static");
    expect(result.current.isLoading).toBe(true);
  });

  it("does not use an in-memory copy older than 12 hours", async () => {
    respondWith(LIVE);
    const first = renderHook(() => useExchangeRates());
    await waitFor(() => expect(first.result.current.source).toBe("live"));
    first.unmount();

    const later = Date.now() + 12 * 60 * 60 * 1000 + 1000;
    jest.spyOn(Date, "now").mockReturnValue(later);
    neverRespond();
    const second = renderHook(() => useExchangeRates());
    expect(second.result.current.rates).toEqual(AED_EXCHANGE_RATES);
    expect(second.result.current.source).toBe("static");
    expect(second.result.current.isLoading).toBe(true);
    await act(async () => {});
  });
});
