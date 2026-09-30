import {
  DEFAULT_PREFERENCES,
  decodePreferencesCookie,
  encodePreferencesCookie,
  htmlPreferenceProps,
  isDefaultPreferences,
  parsePreferences,
} from "@/lib/a11y/preferences";

/**
 * The Accessibility panel's choices live in a cookie the server reads to put
 * data-a11y-* attributes on <html>. Whatever is in that cookie — ours, an old
 * version, or something tampered with — must turn into a valid set of choices.
 */
describe("accessibility preferences", () => {
  it("round-trips through the cookie", () => {
    const prefs = { ...DEFAULT_PREFERENCES, textScale: 130 as const, highContrast: true, strongFocus: true };

    expect(decodePreferencesCookie(encodePreferencesCookie(prefs))).toEqual(prefs);
  });

  it("falls back per field on anything unreadable or out of range", () => {
    expect(parsePreferences("not json")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("null")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(JSON.stringify({ textScale: 400, highContrast: "yes", reduceMotion: true }))).toEqual({
      ...DEFAULT_PREFERENCES,
      reduceMotion: true,
    });
    expect(decodePreferencesCookie("%E0%A4%A")).toEqual(DEFAULT_PREFERENCES);
    expect(decodePreferencesCookie(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it("puts only the chosen settings on <html>, so the default page carries none", () => {
    expect(htmlPreferenceProps(DEFAULT_PREFERENCES)).toEqual({});
    expect(
      htmlPreferenceProps({ ...DEFAULT_PREFERENCES, textScale: 150, highContrast: true, readableFont: true }),
    ).toEqual({ "data-a11y-text": "150", "data-a11y-contrast": "high", "data-a11y-font": "readable" });
  });

  it("knows when nothing has been changed", () => {
    expect(isDefaultPreferences(DEFAULT_PREFERENCES)).toBe(true);
    expect(isDefaultPreferences({ ...DEFAULT_PREFERENCES, wideSpacing: true })).toBe(false);
  });
});
