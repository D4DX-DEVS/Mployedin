/**
 * User-controlled display preferences (accessibility settings panel).
 *
 * These are conveniences on top of — never a substitute for — WCAG 2.2 AA
 * conformance of the markup itself (no overlay-style "auto fixes"). Each
 * preference maps to a `data-a11y-*` attribute on <html>; globals.css holds
 * the rules. Stored in localStorage as a user-requested UI preference, which
 * is exempt from cookie consent (WP29 Opinion 04/2012, "UI customisation").
 */

export const A11Y_STORAGE_KEY = "mp_a11y";
export const A11Y_CHANGE_EVENT = "mp:a11y-change";
export const A11Y_OPEN_EVENT = "mp:open-a11y";

export const TEXT_SIZES = ["100", "115", "130", "150"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface A11yPreferences {
  /** Root font size in percent — everything sized in rem scales with it. */
  textSize: TextSize;
  /** Stronger text / border contrast, no translucent surfaces. */
  highContrast: boolean;
  /** Stop animations, transitions and smooth scrolling. */
  reduceMotion: boolean;
  /** Underline every link, not only on hover. */
  underlineLinks: boolean;
  /** WCAG 1.4.12 text-spacing values (line, letter, word, paragraph). */
  textSpacing: boolean;
  /** Atkinson Hyperlegible, designed for low-vision readers. */
  readableFont: boolean;
  /** Thicker, high-contrast focus indicator. */
  strongFocus: boolean;
  /** Larger mouse pointer. */
  bigCursor: boolean;
  /** Horizontal band that follows the pointer to help keep your place. */
  readingGuide: boolean;
}

export const DEFAULT_A11Y: A11yPreferences = {
  textSize: "100",
  highContrast: false,
  reduceMotion: false,
  underlineLinks: false,
  textSpacing: false,
  readableFont: false,
  strongFocus: false,
  bigCursor: false,
  readingGuide: false,
};

export type BooleanPreference = Exclude<keyof A11yPreferences, "textSize">;

export const BOOLEAN_PREFERENCES: BooleanPreference[] = [
  "highContrast",
  "reduceMotion",
  "underlineLinks",
  "textSpacing",
  "readableFont",
  "strongFocus",
  "bigCursor",
  "readingGuide",
];

/** Attribute name on <html> for each preference. */
export const A11Y_ATTRIBUTES: Record<keyof A11yPreferences, string> = {
  textSize: "data-a11y-text",
  highContrast: "data-a11y-contrast",
  reduceMotion: "data-a11y-motion",
  underlineLinks: "data-a11y-links",
  textSpacing: "data-a11y-spacing",
  readableFont: "data-a11y-font",
  strongFocus: "data-a11y-focus",
  bigCursor: "data-a11y-cursor",
  readingGuide: "data-a11y-guide",
};

export function sanitizePreferences(input: unknown): A11yPreferences {
  const out: A11yPreferences = { ...DEFAULT_A11Y };
  if (!input || typeof input !== "object") return out;
  const raw = input as Record<string, unknown>;
  if (typeof raw.textSize === "string" && (TEXT_SIZES as readonly string[]).includes(raw.textSize)) {
    out.textSize = raw.textSize as TextSize;
  }
  for (const key of BOOLEAN_PREFERENCES) {
    if (typeof raw[key] === "boolean") out[key] = raw[key] as boolean;
  }
  return out;
}

export function isDefault(prefs: A11yPreferences): boolean {
  return (Object.keys(DEFAULT_A11Y) as (keyof A11yPreferences)[]).every((k) => prefs[k] === DEFAULT_A11Y[k]);
}

/** Reflect preferences onto <html>. Default values remove the attribute. */
export function applyPreferences(prefs: A11yPreferences, root: HTMLElement = document.documentElement): void {
  if (prefs.textSize === "100") root.removeAttribute(A11Y_ATTRIBUTES.textSize);
  else root.setAttribute(A11Y_ATTRIBUTES.textSize, prefs.textSize);
  for (const key of BOOLEAN_PREFERENCES) {
    if (prefs[key]) root.setAttribute(A11Y_ATTRIBUTES[key], "on");
    else root.removeAttribute(A11Y_ATTRIBUTES[key]);
  }
}

export function loadPreferences(): A11yPreferences {
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    return raw ? sanitizePreferences(JSON.parse(raw)) : { ...DEFAULT_A11Y };
  } catch {
    return { ...DEFAULT_A11Y };
  }
}

export function savePreferences(prefs: A11yPreferences): void {
  try {
    if (isDefault(prefs)) localStorage.removeItem(A11Y_STORAGE_KEY);
    else localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked — preferences last for this page view only */
  }
  applyPreferences(prefs);
  window.dispatchEvent(new CustomEvent(A11Y_CHANGE_EVENT, { detail: prefs }));
}

export function openAccessibilitySettings(): void {
  window.dispatchEvent(new Event(A11Y_OPEN_EVENT));
}

/**
 * Blocking inline <head> script: applies saved preferences before first paint
 * so large text / high contrast never flashes the default styling. Mirrors
 * applyPreferences(); keep dependency-free.
 */
export function getA11yInitScript(): string {
  const attrs = JSON.stringify(A11Y_ATTRIBUTES);
  return `(()=>{try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(A11Y_STORAGE_KEY)})||"null");if(!p||typeof p!=="object")return;var a=${attrs},r=document.documentElement;if(["115","130","150"].indexOf(p.textSize)>-1)r.setAttribute(a.textSize,p.textSize);for(var k in a){if(k!=="textSize"&&p[k]===true)r.setAttribute(a[k],"on")}}catch(e){}})();`;
}
