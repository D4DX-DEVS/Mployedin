import { z } from "zod";

/**
 * Brand kit: the logo, colours, font and tone a poster is drawn with.
 *
 * Every employer starts on the Mployedin kit; Settings › Brand kit lets them
 * override any part of it. Admins can change the Mployedin default itself.
 * Client-safe (no server imports): the poster maker, the settings page and the
 * server-side poster image all read the same definitions.
 */

/**
 * Fonts a poster may use. Only fonts the app already loads (next/font in
 * app/layout.tsx) or system fonts, so the PNG export draws the same glyphs the
 * preview shows.
 */
export const BRAND_FONTS = {
  manrope: { label: "Manrope", stack: "var(--font-manrope), Manrope, system-ui, sans-serif" },
  lexend: { label: "Lexend", stack: "var(--font-lexend), Lexend, system-ui, sans-serif" },
  arabic: { label: "Noto Sans Arabic", stack: "var(--font-noto-arabic), 'Noto Sans Arabic', system-ui, sans-serif" },
  serif: { label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
} as const;

export type BrandFont = keyof typeof BRAND_FONTS;
export const BRAND_FONT_IDS = Object.keys(BRAND_FONTS) as BrandFont[];

export const BRAND_TONES = ["friendly", "formal", "energetic"] as const;
export type BrandTone = (typeof BRAND_TONES)[number];

export interface BrandKit {
  /** Logo drawn on the poster. Empty means "use the company logo from the profile". */
  logoUrl?: string;
  primary: string;
  accent: string;
  text: string;
  background: string;
  font: BrandFont;
  tone: BrandTone;
}

export const MPLOYEDIN_LOGO_URL = "/mployedin-logo.png";

/** The Mployedin kit: the default for every employer until they set their own. */
export const MPLOYEDIN_BRAND_KIT: BrandKit = {
  logoUrl: MPLOYEDIN_LOGO_URL,
  primary: "#0247cf",
  accent: "#1aa3e6",
  text: "#1f2840",
  background: "#ffffff",
  font: "manrope",
  tone: "friendly",
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().regex(HEX, "Use a colour like #0247cf");

/** A logo is either a site path (/…) or an https URL; nothing else reaches an <img>. */
const logoUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//i.test(v), "Use an https address for the logo")
  .optional();

export const brandKitSchema = z
  .object({
    logoUrl,
    primary: hex,
    accent: hex,
    text: hex,
    background: hex,
    font: z.enum(BRAND_FONT_IDS as [BrandFont, ...BrandFont[]]),
    tone: z.enum(BRAND_TONES),
  })
  .strict();

/** Fill any missing part of a stored kit from `base` (the Mployedin default unless given). */
export function resolveBrandKit(stored?: Partial<BrandKit> | null, base: BrandKit = MPLOYEDIN_BRAND_KIT): BrandKit {
  const pick = <K extends keyof BrandKit>(key: K): BrandKit[K] => {
    const value = stored?.[key];
    return value === undefined || value === null || value === "" ? base[key] : (value as BrandKit[K]);
  };
  return {
    logoUrl: pick("logoUrl"),
    primary: pick("primary"),
    accent: pick("accent"),
    text: pick("text"),
    background: pick("background"),
    font: BRAND_FONTS[pick("font")] ? pick("font") : base.font,
    tone: (BRAND_TONES as readonly string[]).includes(pick("tone")) ? pick("tone") : base.tone,
  };
}

/** Relative luminance (WCAG) of a #rrggbb colour. */
function luminance(color: string): number {
  const channel = (i: number) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `background`. */
export function readableTextOn(background: string): "#ffffff" | "#111827" {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111827") ? "#ffffff" : "#111827";
}
