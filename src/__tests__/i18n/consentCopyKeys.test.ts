/**
 * @jest-environment node
 *
 * The cookie banner and Cookie settings dialog are translated on the server
 * from one key list (src/lib/consent/copy.ts), and the receipt route hashes the
 * same list. A key missing from either locale would crash the banner on every
 * page (next-intl throws) and silently change the receipt hash.
 */
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import { consentCopyKeys, purposeKeys } from "@/lib/consent/copy";
import { REGISTRY } from "@/lib/consent/registry";

function resolve(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    messages,
  );
}

const LINK_KEYS = ["footer.cookieSettings", "profileDropdown.cookieSettings", "dataPrivacy.cookieSettings"];

describe.each([
  ["en", en],
  ["ar", ar],
] as const)("%s consent copy", (_locale, messages) => {
  it("has a non-empty string for every banner, dialog and item key", () => {
    const missing = [...consentCopyKeys(), ...LINK_KEYS].filter((key) => {
      const value = resolve(messages, key);
      return typeof value !== "string" || value.trim() === "";
    });
    expect(missing).toEqual([]);
  });

  it("labels every REGISTRY purpose", () => {
    const missing = [...new Set(REGISTRY.map((item) => item.purposeKey))].filter(
      (key) => typeof resolve(messages, `consent.items.${key}`) !== "string",
    );
    expect(missing).toEqual([]);
  });
});

describe("consent copy keys", () => {
  it("uses the agreed English banner wording", () => {
    // [LEGAL] wording from the PECR plan, Task 5.
    expect(resolve(en, "landing.cookieConsent")).toBe(
      "We use cookies that are needed to sign you in and keep the site secure. We also remember your display settings (language, currency, accessibility) unless you say no, and with your permission we play videos from YouTube. Change this any time in Cookie settings.",
    );
    expect(resolve(en, "landing.cookieRejectAll")).toBe("Reject all");
    expect(resolve(en, "landing.cookieAcceptAll")).toBe("Accept all");
    expect(resolve(en, "landing.cookieCustomise")).toBe("Customise");
    expect(resolve(en, "landing.cookiePolicy")).toBe("Cookie Policy");
    expect(resolve(en, "consent.settings.preferencesTitle")).toBe("Remember my display settings");
  });

  it("lists each purpose once, in REGISTRY order", () => {
    const keys = purposeKeys();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe(REGISTRY[0].purposeKey);
    expect(purposeKeys("media")).toEqual(["youtube"]);
    expect(purposeKeys("necessary")).not.toContain("locale");
  });

  it("is a fixed list, so the receipt hash only changes when the text does", () => {
    expect(consentCopyKeys()).toEqual(consentCopyKeys());
    expect(consentCopyKeys().slice(0, 5)).toEqual([
      "landing.cookieConsent",
      "landing.cookiePolicy",
      "landing.cookieRejectAll",
      "landing.cookieAcceptAll",
      "landing.cookieCustomise",
    ]);
  });

  it("keeps error-free, non-legal UI copy (no [LEGAL] markers on screen)", () => {
    for (const messages of [en, ar]) {
      const shown = consentCopyKeys().map((key) => String(resolve(messages, key)));
      expect(shown.filter((text) => /\[LEGAL\]|^Failed to/.test(text))).toEqual([]);
    }
  });
});

/** Keys the Data & Privacy panel and the admin GDPR consent log show for the cookie choice (Task 5b). */
const CHOICE_DISPLAY_KEYS = [
  "dataPrivacy.cookiesChoice",
  "dataPrivacy.cookiesDisplayOn",
  "dataPrivacy.cookiesDisplayOff",
  "dataPrivacy.cookiesVideosOn",
  "dataPrivacy.cookiesVideosOff",
  "dataPrivacy.cookiesChosenOn",
  "adminGdpr.consentTypeCookiesPreferences",
  "adminGdpr.consentTypeCookiesMedia",
  "adminGdpr.consentSourceCookieSettings",
];

describe.each([
  ["en", en],
  ["ar", ar],
] as const)("%s cookie choice display copy", (_locale, messages) => {
  it("has every key, translated (not the English text) in Arabic", () => {
    for (const key of CHOICE_DISPLAY_KEYS) {
      const value = resolve(messages, key);
      expect(typeof value === "string" && value.trim() !== "").toBe(true);
      if (_locale === "ar") expect(value).not.toBe(resolve(en, key));
    }
  });

  it("keeps the placeholders the panel fills in", () => {
    expect(resolve(messages, "dataPrivacy.cookiesChoice")).toEqual(expect.stringContaining("{display}"));
    expect(resolve(messages, "dataPrivacy.cookiesChoice")).toEqual(expect.stringContaining("{videos}"));
    expect(resolve(messages, "dataPrivacy.cookiesChosenOn")).toEqual(expect.stringContaining("{date}"));
  });
});
