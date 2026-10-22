/**
 * The one client-side sequence that records a cookie choice, whoever asks for it
 * (the banner, the Cookie settings dialog, the YouTube facade's "Always play
 * videos"): read the old choice, store the new one, clear withdrawn preference
 * storage, then send the receipt without waiting for it.
 */
import { CONSENT_EVENT, readConsent, withdrawCleanup, writeConsent } from "@/lib/consent/client";
import { readPendingReceipt, markReceiptPending } from "@/lib/consent/pendingReceipt";
import { recordConsentChoice } from "@/lib/consent/recordChoice";
import { CONSENT_COOKIE } from "@/lib/consent/state";

const csrfFetchMock = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetchMock(...args),
}));

jest.mock("@/lib/consent/client", () => {
  const actual = jest.requireActual("@/lib/consent/client");
  return { ...actual, writeConsent: jest.fn(actual.writeConsent), withdrawCleanup: jest.fn(actual.withdrawCleanup) };
});

const realWrite = (jest.requireActual("@/lib/consent/client") as { writeConsent: typeof writeConsent }).writeConsent;
const realCleanup = (jest.requireActual("@/lib/consent/client") as { withdrawCleanup: typeof withdrawCleanup }).withdrawCleanup;

function receiptBody(call = 0): Record<string, unknown> {
  const [url, init] = csrfFetchMock.mock.calls[call] as [string, RequestInit];
  expect(url).toBe("/api/consent/receipt");
  expect(init.method).toBe("POST");
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  window.localStorage.clear();
  window.sessionStorage.clear();
  csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
  (writeConsent as jest.Mock).mockReset().mockImplementation(realWrite);
  (withdrawCleanup as jest.Mock).mockReset().mockImplementation(realCleanup);
});

describe("recordConsentChoice", () => {
  it("stores the choice, fires the consent event and returns the stored state", async () => {
    const seen = jest.fn();
    window.addEventListener(CONSENT_EVENT, seen);
    try {
      const state = await recordConsentChoice({ preferences: true, media: true }, { locale: "en", source: "banner" });
      expect(state).toMatchObject({ preferences: true, media: true });
      expect(readConsent()).toEqual(state);
      expect(seen).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(CONSENT_EVENT, seen);
    }
  });

  it("posts exactly one receipt that names the stored choice", async () => {
    const state = await recordConsentChoice({ preferences: false, media: true }, { locale: "en", source: "settings" });
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(receiptBody()).toEqual({
      receiptId: state!.id,
      preferences: false,
      media: true,
      version: 1,
      locale: "en",
      source: "settings",
    });
  });

  it("sends 'ar' for an Arabic page and 'en' for any other locale", async () => {
    await recordConsentChoice({ preferences: true, media: false }, { locale: "ar", source: "banner" });
    await recordConsentChoice({ preferences: true, media: false }, { locale: "fr", source: "banner" });
    expect(receiptBody(0).locale).toBe("ar");
    expect(receiptBody(1).locale).toBe("en");
  });

  it("reports a choice made from the video placeholder as a Cookie settings change", async () => {
    // The receipt route only knows 'banner' and 'settings'; ticking "Always play videos" changes a setting.
    await recordConsentChoice({ preferences: true, media: true }, { locale: "en", source: "facade" });
    expect(receiptBody().source).toBe("settings");
  });

  it("runs withdrawCleanup with the old and the new choice, before the receipt", async () => {
    const prev = realWrite({ preferences: true, media: true });
    (writeConsent as jest.Mock).mockClear();
    window.localStorage.setItem("ui:setup-guide", "dismissed");

    const next = await recordConsentChoice({ preferences: false, media: true }, { locale: "en", source: "settings" });

    expect(withdrawCleanup).toHaveBeenCalledTimes(1);
    const [cleanupPrev, cleanupNext] = (withdrawCleanup as jest.Mock).mock.calls[0];
    expect(cleanupPrev).toMatchObject({ id: prev.id, preferences: true });
    expect(cleanupNext).toEqual(next);
    expect(window.localStorage.getItem("ui:setup-guide")).toBeNull();
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes null as the old choice when none was stored yet", async () => {
    await recordConsentChoice({ preferences: true, media: true }, { locale: "en", source: "banner" });
    expect((withdrawCleanup as jest.Mock).mock.calls[0][0]).toBeNull();
  });

  describe("never throws", () => {
    it("returns null, stores nothing and sends no receipt when writeConsent throws", async () => {
      (writeConsent as jest.Mock).mockImplementation(() => {
        throw new Error("cookies blocked");
      });
      await expect(
        recordConsentChoice({ preferences: true, media: true }, { locale: "en", source: "facade" }),
      ).resolves.toBeNull();
      expect(withdrawCleanup).not.toHaveBeenCalled();
      expect(csrfFetchMock).not.toHaveBeenCalled();
      expect(readConsent()).toBeNull();
    });

    it("keeps the choice and still sends the receipt when withdrawCleanup rejects", async () => {
      (withdrawCleanup as jest.Mock).mockRejectedValue(new Error("storage blocked"));
      const state = await recordConsentChoice({ preferences: false, media: false }, { locale: "en", source: "banner" });
      expect(state).toMatchObject({ preferences: false, media: false });
      expect(readConsent()).toEqual(state);
      expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    });

    it("keeps the choice and still sends the receipt when withdrawCleanup throws at once", async () => {
      (withdrawCleanup as jest.Mock).mockImplementation(() => {
        throw new Error("storage blocked");
      });
      const state = await recordConsentChoice({ preferences: false, media: true }, { locale: "en", source: "banner" });
      expect(state).toMatchObject({ preferences: false, media: true });
      expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["rejects", () => csrfFetchMock.mockRejectedValue(new Error("offline"))],
      [
        "throws at once",
        () =>
          csrfFetchMock.mockImplementation(() => {
            throw new Error("no fetch");
          }),
      ],
    ])("returns the stored choice when the receipt request %s", async (_name, arrange) => {
      arrange();
      const state = await recordConsentChoice({ preferences: true, media: true }, { locale: "en", source: "banner" });
      expect(state).toMatchObject({ preferences: true, media: true });
      expect(readConsent()).toEqual(state);
    });
  });

  describe("receipt delivery", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    const choose = () => recordConsentChoice({ preferences: true, media: false }, { locale: "en", source: "banner" });

    it.each([[429], [500], [503]])("retries once, about 2 s later, after a %i", async (status) => {
      csrfFetchMock.mockResolvedValueOnce({ ok: false, status }).mockResolvedValueOnce({ ok: true, status: 204 });
      await choose();
      expect(csrfFetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1500);
      expect(csrfFetchMock).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1000);
      expect(csrfFetchMock).toHaveBeenCalledTimes(2);
      // The same receipt, so the route stores the same choice.
      expect(receiptBody(1)).toEqual(receiptBody(0));
    });

    it("gives up after one retry", async () => {
      csrfFetchMock.mockResolvedValue({ ok: false, status: 429 });
      await choose();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(csrfFetchMock).toHaveBeenCalledTimes(2);
    });

    // 409: the server found that the receipt does not match the choice cookie this
    // browser sent (or no cookie at all). Sending it again would only repeat that.
    it.each([[204], [400], [403], [409]])("does not retry after a %i", async (status) => {
      csrfFetchMock.mockResolvedValue({ ok: status < 400, status });
      await choose();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not retry when the first request itself failed to leave the device", async () => {
      csrfFetchMock.mockRejectedValue(new Error("offline"));
      await choose();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("the receipt is remembered before it is sent, so a failed or interrupted delivery is not lost", () => {
    beforeEach(() => jest.useFakeTimers({ now: new Date("2026-10-22T10:00:00.000Z") }));
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    const choose = (source: "banner" | "settings" | "facade" = "settings", locale = "en") =>
      recordConsentChoice({ preferences: true, media: false }, { locale, source });

    it("writes the marker BEFORE the first request goes out (a page that closes mid-request keeps it)", async () => {
      let markerWhenSent: unknown = "request not made";
      csrfFetchMock.mockImplementation(() => {
        markerWhenSent = readPendingReceipt();
        return Promise.resolve({ ok: true, status: 204 });
      });
      const state = await choose("banner", "ar");

      expect(markerWhenSent).toEqual({ id: state!.id, locale: "ar", source: "banner", attempts: 0, nextAt: 0 });
    });

    it.each([[204], [400], [403], [409]])("clears the marker once the server has answered %i (stored, or a refusal a resend would only repeat)", async (status) => {
      csrfFetchMock.mockResolvedValue({ ok: status < 400, status });
      await choose();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(readPendingReceipt()).toBeNull();
    });

    it("keeps the marker while the first request is still running", async () => {
      csrfFetchMock.mockReturnValue(new Promise(() => undefined));
      const state = await choose();
      expect(readPendingReceipt()).toMatchObject({ id: state!.id, attempts: 0 });
    });

    it.each([[500], [503], [429]])("keeps the marker, held back 30 s, when the retry also ends in %i", async (status) => {
      csrfFetchMock.mockResolvedValue({ ok: false, status });
      const startedAt = Date.now();
      const state = await choose("facade", "ar");
      expect(readPendingReceipt()).toMatchObject({ id: state!.id, attempts: 0 }); // still inside the in-session retry
      await jest.advanceTimersByTimeAsync(2500);

      expect(csrfFetchMock).toHaveBeenCalledTimes(2);
      // facade is reported as a settings change, and the locale is kept for the re-send
      expect(readPendingReceipt()).toEqual({ id: state!.id, locale: "ar", source: "settings", attempts: 0, nextAt: startedAt + 2000 + 30_000 }); // the retry failed 2 s in
    });

    it("keeps the marker, held back 30 s, when the request never left the device (network error), without a second try", async () => {
      csrfFetchMock.mockRejectedValue(new Error("offline"));
      const state = await choose("banner");
      await jest.advanceTimersByTimeAsync(30_000);

      expect(csrfFetchMock).toHaveBeenCalledTimes(1);
      expect(readPendingReceipt()).toMatchObject({ id: state!.id, source: "banner", attempts: 0 });
      expect(readPendingReceipt()!.nextAt).toBeGreaterThan(0);
    });

    it("clears the marker when the retry succeeds", async () => {
      csrfFetchMock.mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce({ ok: true, status: 204 });
      await choose();
      await jest.advanceTimersByTimeAsync(2500);
      expect(readPendingReceipt()).toBeNull();
    });

    it("still stores and applies the choice whatever happens to the receipt", async () => {
      csrfFetchMock.mockResolvedValue({ ok: false, status: 500 });
      const state = await choose();
      expect(readConsent()).toEqual(state);
    });

    it("a new choice replaces an older marker straight away", async () => {
      const old = realWrite({ preferences: true, media: true });
      markReceiptPending(old.id, "en", "banner");
      csrfFetchMock.mockReturnValue(new Promise(() => undefined));
      const state = await choose();
      expect(readPendingReceipt()).toMatchObject({ id: state!.id });
    });

    it("a late answer for an older choice neither clears nor overwrites the newer choice's marker", async () => {
      let releaseFirst: (value: { ok: boolean; status: number }) => void = () => undefined;
      csrfFetchMock
        .mockReturnValueOnce(new Promise((resolve) => (releaseFirst = resolve)))
        .mockReturnValue(new Promise(() => undefined));
      const first = await choose("banner");
      const second = await recordConsentChoice({ preferences: false, media: false }, { locale: "en", source: "settings" });
      expect(first!.id).not.toBe(second!.id);

      releaseFirst({ ok: true, status: 204 });
      await jest.advanceTimersByTimeAsync(0);

      expect(readPendingReceipt()).toMatchObject({ id: second!.id });
    });

    it("a late failure for an older choice does not mark it once a newer choice is in force", async () => {
      csrfFetchMock.mockResolvedValue({ ok: false, status: 500 });
      const first = await choose("banner");
      const second = await recordConsentChoice({ preferences: false, media: false }, { locale: "en", source: "settings" });
      expect(first!.id).not.toBe(second!.id);

      await jest.advanceTimersByTimeAsync(2500); // both retries end in 500

      expect(readPendingReceipt()).toMatchObject({ id: second!.id });
    });
  });
});
