import { REGISTRY } from "./registry";
import type { ConsentCategory } from "./state";

/**
 * Message keys for the cookie banner and the Cookie settings dialog. One list
 * feeds both the labels CookieConsentMount translates and the receipt route's
 * bannerTextHash, so a receipt always names the exact text the visitor saw.
 *
 * Client-safe (no server imports). Keep the order fixed: the hash reads the
 * keys in this order, so reordering changes every new receipt's hash.
 * [LEGAL] the wording behind these keys needs solicitor/DPO sign-off.
 */
export const BANNER_COPY_KEYS = {
  message: "landing.cookieConsent",
  policy: "landing.cookiePolicy",
  rejectAll: "landing.cookieRejectAll",
  acceptAll: "landing.cookieAcceptAll",
  customise: "landing.cookieCustomise",
} as const;

export const SETTINGS_COPY_KEYS = {
  title: "consent.settings.title",
  description: "consent.settings.description",
  necessaryTitle: "consent.settings.necessaryTitle",
  necessaryDescription: "consent.settings.necessaryDescription",
  alwaysOn: "consent.settings.alwaysOn",
  preferencesTitle: "consent.settings.preferencesTitle",
  preferencesDescription: "consent.settings.preferencesDescription",
  preferencesIfOff: "consent.settings.preferencesIfOff",
  preferencesUndo: "consent.settings.preferencesUndo",
  mediaTitle: "consent.settings.mediaTitle",
  mediaDescription: "consent.settings.mediaDescription",
  mediaIfOff: "consent.settings.mediaIfOff",
  mediaUndo: "consent.settings.mediaUndo",
  mediaGoogleControls: "consent.settings.mediaGoogleControls",
  reference: "consent.settings.reference",
  save: "consent.settings.save",
  /** The disclosure over Strictly necessary's long list; the dialog appends the count: "Show what this covers (13)". */
  showCovered: "consent.settings.showCovered",
  hideCovered: "consent.settings.hideCovered",
} as const;

export type BannerCopy = { [K in keyof typeof BANNER_COPY_KEYS]: string };
export type SettingsCopy = { [K in keyof typeof SETTINGS_COPY_KEYS]: string };
/** Purpose label per REGISTRY purposeKey (messages `consent.items.<purposeKey>`). */
export type ItemCopy = Record<string, string>;

/** Each REGISTRY purpose once, in REGISTRY order; optionally one category's only. */
export function purposeKeys(category?: ConsentCategory): string[] {
  const rows = category ? REGISTRY.filter((item) => item.category === category) : REGISTRY;
  return [...new Set(rows.map((item) => item.purposeKey))];
}

export function itemCopyKey(purposeKey: string): string {
  return `consent.items.${purposeKey}`;
}

/** Every key the banner and dialog show, in the fixed order the receipt hash reads. */
export function consentCopyKeys(): string[] {
  return [
    ...Object.values(BANNER_COPY_KEYS),
    ...Object.values(SETTINGS_COPY_KEYS),
    ...purposeKeys().map(itemCopyKey),
  ];
}
