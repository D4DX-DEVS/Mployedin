/**
 * @jest-environment node
 */
import { localeCookieEnabled } from "@/lib/consent/localeCookie";
import { CONSENT_COOKIE, serializeConsent, type ConsentState } from "@/lib/consent/state";

function jar(values: Record<string, string>) {
  return { get: (name: string) => (name in values ? { value: values[name] } : undefined) };
}
function consent(over: Partial<ConsentState>): string {
  return serializeConsent({ v: 1, id: "x", preferences: false, media: false, at: "2026-10-20T00:00:00.000Z", ...over });
}

describe("localeCookieEnabled: may the proxy read and refresh NEXT_LOCALE?", () => {
  it("is off when the visitor has no NEXT_LOCALE (so visiting /ar never creates one)", () => {
    expect(localeCookieEnabled(jar({}))).toBe(false);
    expect(localeCookieEnabled(jar({ [CONSENT_COOKIE]: consent({ preferences: true }) }))).toBe(false);
  });
  it("is on for an existing NEXT_LOCALE when no choice was made (appearance exception, D1)", () => {
    expect(localeCookieEnabled(jar({ NEXT_LOCALE: "ar" }))).toBe(true);
  });
  it("is off once the visitor objected to preferences", () => {
    expect(localeCookieEnabled(jar({ NEXT_LOCALE: "ar", [CONSENT_COOKIE]: consent({ preferences: false }) }))).toBe(false);
  });
  it("is on when the visitor accepted preferences", () => {
    expect(localeCookieEnabled(jar({ NEXT_LOCALE: "ar", [CONSENT_COOKIE]: consent({ preferences: true }) }))).toBe(true);
  });
  it("ignores an unreadable consent cookie like no choice", () => {
    expect(localeCookieEnabled(jar({ NEXT_LOCALE: "ar", [CONSENT_COOKIE]: "%7Bnot-json" }))).toBe(true);
  });
  it("treats an empty NEXT_LOCALE as absent", () => {
    expect(localeCookieEnabled(jar({ NEXT_LOCALE: "" }))).toBe(false);
  });
});
