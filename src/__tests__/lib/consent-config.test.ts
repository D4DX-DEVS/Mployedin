/**
 * @jest-environment node
 */
import {
  ALL_DENIED,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_POLICY_VERSION,
  COOKIE_INVENTORY,
  type ConsentState,
  isCategoryAllowed,
  needsConsentPrompt,
  parseConsent,
  serializeConsent,
} from "@/lib/consent/config";
import enMessages from "../../../messages/en.json";
import arMessages from "../../../messages/ar.json";

const state: ConsentState = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  version: CONSENT_POLICY_VERSION,
  timestamp: Date.now(),
  choices: { functional: true, analytics: false, marketing: false },
  method: "custom",
  gpc: false,
};

describe("consent cookie codec", () => {
  it("round-trips a state", () => {
    expect(parseConsent(serializeConsent(state))).toEqual(state);
    expect(parseConsent(encodeURIComponent(serializeConsent(state)))).toEqual(state);
  });

  it.each([
    ["empty", ""],
    ["garbage", "hello"],
    ["wrong prefix", serializeConsent(state).replace("v1", "v2")],
    ["bad bits", serializeConsent(state).replace("|100|", "|1x0|")],
    ["bad method", serializeConsent(state).replace("|custom|", "|sneaky|")],
    ["bad id", serializeConsent({ ...state, id: "<script>" })],
    ["broken uri encoding", "%E0%A4%A"],
  ])("rejects %s", (_label, raw) => {
    expect(parseConsent(raw)).toBeNull();
  });
});

describe("consent validity", () => {
  it("asks when nothing is stored, the version changed, or the choice expired", () => {
    expect(needsConsentPrompt(null)).toBe(true);
    expect(needsConsentPrompt({ ...state, version: "2000-01-01" })).toBe(true);
    expect(needsConsentPrompt({ ...state, timestamp: Date.now() - (CONSENT_MAX_AGE_SECONDS + 60) * 1000 })).toBe(true);
    expect(needsConsentPrompt(state)).toBe(false);
  });

  it("allows necessary always and optional categories only when opted in", () => {
    expect(isCategoryAllowed(null, "necessary")).toBe(true);
    expect(isCategoryAllowed(null, "analytics")).toBe(false);
    expect(isCategoryAllowed(state, "functional")).toBe(true);
    expect(isCategoryAllowed(state, "analytics")).toBe(false);
    expect(isCategoryAllowed({ ...state, version: "2000-01-01" }, "functional")).toBe(false);
  });

  it("has no optional category granted by default", () => {
    expect(Object.values(ALL_DENIED).every((v) => v === false)).toBe(true);
  });
});

describe("cookie inventory translations", () => {
  const catalogs = { en: enMessages, ar: arMessages } as Record<string, { consent: { inventory: Record<string, string> } }>;
  it.each(Object.keys(catalogs))("every inventory key exists in %s", (locale) => {
    const inv = catalogs[locale].consent.inventory;
    for (const item of COOKIE_INVENTORY) {
      expect(inv[item.purposeKey]).toBeTruthy();
      expect(inv[item.durationKey]).toBeTruthy();
    }
  });
});
