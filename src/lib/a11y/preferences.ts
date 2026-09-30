/**
 * Visitor-chosen display preferences from the Accessibility panel.
 *
 * Saved per browser in a first-party cookie and applied as data-a11y-*
 * attributes on <html>, which `app/a11y-preferences.css` styles. The root
 * layout reads the cookie, so the attributes are in the server's HTML and a
 * 150% text setting never loads at 100% first. They sit on top of the site's
 * own accessibility work (labels, focus, contrast, skip link) and never replace
 * it: a visitor who changes nothing gets the same accessible site.
 */

/** Root font size steps, in percent of the browser's own setting. */
export const TEXT_SCALES = [90, 100, 115, 130, 150] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export interface A11yPreferences {
  textScale: TextScale;
  highContrast: boolean;
  reduceMotion: boolean;
  readableFont: boolean;
  wideSpacing: boolean;
  highlightLinks: boolean;
  strongFocus: boolean;
}

export const DEFAULT_PREFERENCES: A11yPreferences = {
  textScale: 100,
  highContrast: false,
  reduceMotion: false,
  readableFont: false,
  wideSpacing: false,
  highlightLinks: false,
  strongFocus: false,
};

/** A user-interface choice the visitor makes themselves, so no consent prompt. */
export const PREFERENCES_COOKIE = "mployedin_a11y";
export const PREFERENCES_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const BOOLEAN_KEYS = ["highContrast", "reduceMotion", "readableFont", "wideSpacing", "highlightLinks", "strongFocus"] as const;

/** Anything unreadable or out of range falls back to the default for that field. */
export function parsePreferences(raw: string | null | undefined): A11yPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (!stored || typeof stored !== "object") return DEFAULT_PREFERENCES;
  const value = stored as Record<string, unknown>;
  const prefs: A11yPreferences = { ...DEFAULT_PREFERENCES };
  if (TEXT_SCALES.includes(value.textScale as TextScale)) prefs.textScale = value.textScale as TextScale;
  for (const key of BOOLEAN_KEYS) {
    if (typeof value[key] === "boolean") prefs[key] = value[key];
  }
  return prefs;
}

export function encodePreferencesCookie(prefs: A11yPreferences): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

export function decodePreferencesCookie(value: string | null | undefined): A11yPreferences {
  if (!value) return DEFAULT_PREFERENCES;
  try {
    return parsePreferences(decodeURIComponent(value));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function isDefaultPreferences(prefs: A11yPreferences): boolean {
  return (Object.keys(DEFAULT_PREFERENCES) as (keyof A11yPreferences)[]).every(
    (key) => prefs[key] === DEFAULT_PREFERENCES[key],
  );
}

/** The <html> attributes for a set of preferences; null = attribute absent (the default). */
export function preferenceAttributes(prefs: A11yPreferences): Record<string, string | null> {
  return {
    "data-a11y-text": prefs.textScale === 100 ? null : String(prefs.textScale),
    "data-a11y-contrast": prefs.highContrast ? "high" : null,
    "data-a11y-motion": prefs.reduceMotion ? "reduce" : null,
    "data-a11y-font": prefs.readableFont ? "readable" : null,
    "data-a11y-spacing": prefs.wideSpacing ? "wide" : null,
    "data-a11y-links": prefs.highlightLinks ? "highlight" : null,
    "data-a11y-focus": prefs.strongFocus ? "strong" : null,
  };
}

/** Only the attributes that are set, for spreading onto the server's <html>. */
export function htmlPreferenceProps(prefs: A11yPreferences): Record<string, string> {
  return Object.fromEntries(
    Object.entries(preferenceAttributes(prefs)).filter((entry): entry is [string, string] => entry[1] !== null),
  );
}

export function applyPreferences(root: HTMLElement, prefs: A11yPreferences): void {
  for (const [name, value] of Object.entries(preferenceAttributes(prefs))) {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
}
