/**
 * @jest-environment jsdom
 */
import { parseCookieChoice, readCookieChoice } from "@/lib/gdpr/cookieChoice";
import { writeConsent } from "@/lib/consent/client";
import { CONSENT_COOKIE } from "@/lib/consent/state";

beforeEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  localStorage.clear();
});

describe("cookieChoice adapter over mpl_consent", () => {
  it("is null when no choice was made", () => {
    expect(readCookieChoice()).toBeNull();
  });

  it("ignores the legacy localStorage answer", () => {
    localStorage.setItem("cookie-consent", "accepted");
    expect(readCookieChoice()).toBeNull();
  });

  it.each([
    [{ preferences: true, media: true }, "accepted"],
    [{ preferences: true, media: false }, "accepted"],
    [{ preferences: false, media: true }, "accepted"],
    [{ preferences: false, media: false }, "declined"],
  ] as const)("reads %j as %s", (choice, expected) => {
    writeConsent(choice);
    expect(readCookieChoice()).toBe(expected);
  });

  it("keeps the registration contract: only accepted/declined parse", () => {
    expect(parseCookieChoice("accepted")).toBe("accepted");
    expect(parseCookieChoice("declined")).toBe("declined");
    expect(parseCookieChoice("")).toBeNull();
    expect(parseCookieChoice("yes")).toBeNull();
    expect(parseCookieChoice(undefined)).toBeNull();
  });
});
