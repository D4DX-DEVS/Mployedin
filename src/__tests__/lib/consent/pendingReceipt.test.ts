/**
 * A consent receipt that could not be delivered is remembered for the tab and
 * re-sent on the next page loads (and when the browser comes back online), so one
 * database outage does not lose the record of a choice. The visitor's choice itself
 * (the mpl_consent cookie) never waits for any of this. Attempts are spaced out
 * (30 s, 2 min, 10 min) and capped.
 */
import { readConsent, writeConsent } from "@/lib/consent/client";
import {
  MAX_RESENDS,
  RECEIPT_PENDING_KEY,
  RESEND_DELAYS_MS,
  clearPendingReceipt,
  markReceiptPending,
  postReceipt,
  readPendingReceipt,
  receiptBody,
  resendPendingReceipt,
} from "@/lib/consent/pendingReceipt";
import { CONSENT_COOKIE } from "@/lib/consent/state";

const csrfFetchMock = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetchMock(...args),
}));

const T0 = new Date("2026-10-22T10:00:00.000Z");
const MINUTE = 60_000;

/** Time passes: past every spacing, so the next page load is due. */
const waitUntilDue = () => jest.setSystemTime(Date.now() + 11 * MINUTE);

function sentBody(call = 0): Record<string, unknown> {
  const [url, init] = csrfFetchMock.mock.calls[call] as [string, RequestInit];
  expect(url).toBe("/api/consent/receipt");
  expect(init.method).toBe("POST");
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  window.sessionStorage.clear();
  window.localStorage.clear();
  csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("postReceipt", () => {
  it.each([
    [204, "sent"],
    [429, "retry"],
    [500, "retry"],
    [503, "retry"],
    [400, "drop"],
    [403, "drop"],
    [409, "drop"],
  ])("a %i answer is %s", async (status, outcome) => {
    csrfFetchMock.mockResolvedValue({ ok: status < 400, status });
    await expect(postReceipt("{}")).resolves.toBe(outcome);
  });

  it("calls a network error offline, and a synchronous throw too", async () => {
    csrfFetchMock.mockRejectedValue(new Error("offline"));
    await expect(postReceipt("{}")).resolves.toBe("offline");
    csrfFetchMock.mockImplementation(() => {
      throw new Error("no fetch");
    });
    await expect(postReceipt("{}")).resolves.toBe("offline");
  });
});

describe("receiptBody", () => {
  it("is built from the stored choice, with the locale and source given", () => {
    const state = writeConsent({ preferences: false, media: true });
    expect(JSON.parse(receiptBody(state, "ar", "settings"))).toEqual({
      receiptId: state.id,
      preferences: false,
      media: true,
      version: 1,
      locale: "ar",
      source: "settings",
    });
  });
});

describe("the pending marker", () => {
  it("keeps only the reference, locale, source, a counter and the time of the next try: no body, no personal data", () => {
    const state = writeConsent({ preferences: true, media: true });
    markReceiptPending(state.id, "en", "banner");
    expect(JSON.parse(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)!)).toEqual({
      id: state.id,
      locale: "en",
      source: "banner",
      attempts: 0,
      nextAt: 0,
    });
    expect(window.localStorage.length).toBe(0);
  });

  it("can carry the time of the next try", () => {
    const state = writeConsent({ preferences: true, media: true });
    markReceiptPending(state.id, "en", "banner", Date.now() + 30_000);
    expect(readPendingReceipt()).toMatchObject({ attempts: 0, nextAt: T0.getTime() + 30_000 });
  });

  it("lives in the tab (sessionStorage), never on the device", () => {
    markReceiptPending(writeConsent({ preferences: true, media: true }).id, "en", "banner");
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(RECEIPT_PENDING_KEY)).toBeNull();
  });

  it("is only a marker for the current choice: a mismatching id is not written", () => {
    writeConsent({ preferences: true, media: true });
    markReceiptPending("00000000-0000-4000-8000-000000000000", "en", "banner");
    expect(readPendingReceipt()).toBeNull();
  });

  it("clears only its own reference when one is given", () => {
    const state = writeConsent({ preferences: true, media: true });
    markReceiptPending(state.id, "en", "banner");
    clearPendingReceipt("00000000-0000-4000-8000-000000000000");
    expect(readPendingReceipt()?.id).toBe(state.id);
    clearPendingReceipt(state.id);
    expect(readPendingReceipt()).toBeNull();
  });

  it("reads a marker without a time as due now, and junk as nothing", () => {
    const state = writeConsent({ preferences: true, media: true });
    window.sessionStorage.setItem(RECEIPT_PENDING_KEY, JSON.stringify({ id: state.id, locale: "en", source: "banner", attempts: 1 }));
    expect(readPendingReceipt()).toEqual({ id: state.id, locale: "en", source: "banner", attempts: 1, nextAt: 0 });

    for (const junk of ["not json", "{}", '{"id":"x","locale":"en","source":"banner","attempts":0}', "[]", "null"]) {
      window.sessionStorage.setItem(RECEIPT_PENDING_KEY, junk);
      expect(readPendingReceipt()).toBeNull();
    }
  });

  it("never throws when sessionStorage is blocked", () => {
    const state = writeConsent({ preferences: true, media: true });
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(() => markReceiptPending(state.id, "en", "banner")).not.toThrow();
    } finally {
      spy.mockRestore();
    }
    const get = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(readPendingReceipt()).toBeNull();
      expect(() => clearPendingReceipt()).not.toThrow();
    } finally {
      get.mockRestore();
    }
  });
});

describe("resendPendingReceipt (runs on every page load, and when the browser comes back online)", () => {
  function pendingFor(preferences: boolean, media: boolean) {
    const state = writeConsent({ preferences, media });
    markReceiptPending(state.id, "en", "settings");
    return state;
  }

  it("does nothing, and makes no request, when nothing is pending", async () => {
    writeConsent({ preferences: true, media: true });
    await resendPendingReceipt();
    expect(csrfFetchMock).not.toHaveBeenCalled();
  });

  it("re-sends the receipt for the current cookie, built from the cookie itself, then forgets it", async () => {
    const state = pendingFor(false, false);
    await resendPendingReceipt();

    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({
      receiptId: state.id,
      preferences: false,
      media: false,
      version: 1,
      locale: "en",
      source: "settings",
    });
    expect(readPendingReceipt()).toBeNull();
  });

  it("keeps the marker, counts the attempt and spaces the next one 30 s, 2 min, then 10 min out", async () => {
    const state = pendingFor(true, true);
    csrfFetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(RESEND_DELAYS_MS).toEqual([30_000, 2 * MINUTE, 10 * MINUTE]);

    await resendPendingReceipt();
    expect(readPendingReceipt()).toEqual({ id: state.id, locale: "en", source: "settings", attempts: 1, nextAt: Date.now() + 30_000 });
    waitUntilDue();
    await resendPendingReceipt();
    expect(readPendingReceipt()).toEqual({ id: state.id, locale: "en", source: "settings", attempts: 2, nextAt: Date.now() + 2 * MINUTE });
    waitUntilDue();
    await resendPendingReceipt();
    expect(readPendingReceipt()).toEqual({ id: state.id, locale: "en", source: "settings", attempts: 3, nextAt: Date.now() + 10 * MINUTE });
  });

  it("does not send again before the next try is due, and leaves the marker as it was", async () => {
    pendingFor(true, true);
    csrfFetchMock.mockResolvedValue({ ok: false, status: 500 });
    await resendPendingReceipt();
    const after = window.sessionStorage.getItem(RECEIPT_PENDING_KEY);

    jest.setSystemTime(Date.now() + 29_000);
    await resendPendingReceipt();
    await resendPendingReceipt();

    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).toBe(after);

    jest.setSystemTime(Date.now() + 2_000);
    await resendPendingReceipt();
    expect(csrfFetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends at once when the browser comes back online, even before the next try is due, but still counts the attempt", async () => {
    pendingFor(true, true);
    csrfFetchMock.mockResolvedValue({ ok: false, status: 500 });
    await resendPendingReceipt();
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);

    csrfFetchMock.mockResolvedValue({ ok: true, status: 204 });
    await resendPendingReceipt({ ignoreSchedule: true });

    expect(csrfFetchMock).toHaveBeenCalledTimes(2);
    expect(readPendingReceipt()).toBeNull();
  });

  it("keeps the marker through a 429 and a network error as well", async () => {
    pendingFor(true, true);
    csrfFetchMock.mockResolvedValueOnce({ ok: false, status: 429 }).mockRejectedValueOnce(new Error("offline"));
    await resendPendingReceipt();
    waitUntilDue();
    await resendPendingReceipt();
    expect(readPendingReceipt()?.attempts).toBe(2);
  });

  it(`gives up after ${MAX_RESENDS} attempts and sends nothing more, even when told the browser is online`, async () => {
    pendingFor(true, true);
    csrfFetchMock.mockResolvedValue({ ok: false, status: 503 });

    for (let load = 0; load < MAX_RESENDS; load++) {
      await resendPendingReceipt();
      waitUntilDue();
    }
    expect(csrfFetchMock).toHaveBeenCalledTimes(MAX_RESENDS);
    expect(readPendingReceipt()?.attempts).toBe(MAX_RESENDS);

    await resendPendingReceipt({ ignoreSchedule: true });
    expect(csrfFetchMock).toHaveBeenCalledTimes(MAX_RESENDS);
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).toBeNull();
  });

  it("drops the marker for good on a 409, which the server would only repeat", async () => {
    pendingFor(true, true);
    csrfFetchMock.mockResolvedValue({ ok: false, status: 409 });
    await resendPendingReceipt();
    expect(readPendingReceipt()).toBeNull();
    await resendPendingReceipt();
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops the marker and sends nothing when the consent id has changed since", async () => {
    pendingFor(true, true);
    writeConsent({ preferences: false, media: false }); // a newer choice replaces the cookie
    await resendPendingReceipt();
    expect(csrfFetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).toBeNull();
  });

  it("drops the marker and sends nothing when the cookie is gone (cookies cleared or blocked)", async () => {
    pendingFor(true, true);
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
    expect(readConsent()).toBeNull();
    await resendPendingReceipt();
    expect(csrfFetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RECEIPT_PENDING_KEY)).toBeNull();
  });

  it("never sends a body that differs from the cookie, whatever the marker holds", async () => {
    const state = pendingFor(true, false);
    // A tampered marker can change only the locale and source; the choice always comes from the cookie.
    window.sessionStorage.setItem(
      RECEIPT_PENDING_KEY,
      JSON.stringify({ id: state.id, locale: "ar", source: "banner", attempts: 0, nextAt: 0, preferences: false, media: true }),
    );
    await resendPendingReceipt();
    const body = sentBody();
    expect(body).toMatchObject({ receiptId: state.id, preferences: true, media: false, locale: "ar", source: "banner" });
    expect(Object.keys(body).sort()).toEqual(["locale", "media", "preferences", "receiptId", "source", "version"]);
  });

  it("sends once, and counts one attempt, when two page mounts ask at the same moment", async () => {
    pendingFor(true, true);
    csrfFetchMock.mockResolvedValue({ ok: false, status: 500 });
    await Promise.all([resendPendingReceipt(), resendPendingReceipt()]);
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(readPendingReceipt()?.attempts).toBe(1);
  });

  it("does not clear a marker that a newer choice wrote while the request was in flight", async () => {
    const first = pendingFor(true, true);
    let release: (value: { ok: boolean; status: number }) => void = () => undefined;
    csrfFetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const running = resendPendingReceipt();
    const second = writeConsent({ preferences: false, media: false });
    markReceiptPending(second.id, "en", "banner");
    release({ ok: true, status: 204 });
    await running;

    expect(first.id).not.toBe(second.id);
    expect(readPendingReceipt()?.id).toBe(second.id);
  });
});
