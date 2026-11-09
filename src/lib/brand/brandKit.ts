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
 * Fonts a poster may use. Each is loaded in the browser by next/font
 * (posterFontFaces.ts, only on poster pages) and fetched by the server from
 * Google Fonts by `family`, so a downloaded PNG draws the same glyphs the
 * preview shows. `weights` are the ones Google serves, near the 600/700/800
 * posters use. Ids are stored in kits: never rename one.
 */
export const BRAND_FONTS = {
  manrope: { label: "Manrope", family: "Manrope", weights: [600, 700, 800], stack: "var(--font-manrope), Manrope, system-ui, sans-serif" },
  lexend: { label: "Lexend", family: "Lexend", weights: [600, 700, 800], stack: "var(--font-lexend), Lexend, system-ui, sans-serif" },
  poppins: { label: "Poppins", family: "Poppins", weights: [600, 700, 800], stack: "var(--font-poster-poppins), Poppins, system-ui, sans-serif" },
  montserrat: { label: "Montserrat", family: "Montserrat", weights: [600, 700, 800], stack: "var(--font-poster-montserrat), Montserrat, system-ui, sans-serif" },
  inter: { label: "Inter", family: "Inter", weights: [600, 700, 800], stack: "var(--font-poster-inter), Inter, system-ui, sans-serif" },
  nunito: { label: "Nunito", family: "Nunito", weights: [600, 700, 800], stack: "var(--font-poster-nunito), Nunito, system-ui, sans-serif" },
  raleway: { label: "Raleway", family: "Raleway", weights: [600, 700, 800], stack: "var(--font-poster-raleway), Raleway, system-ui, sans-serif" },
  oswald: { label: "Oswald (condensed)", family: "Oswald", weights: [500, 600, 700], stack: "var(--font-poster-oswald), Oswald, Impact, sans-serif" },
  playfair: { label: "Playfair Display (serif)", family: "Playfair Display", weights: [600, 700, 800], stack: "var(--font-poster-playfair), 'Playfair Display', Georgia, serif" },
  serif: { label: "Noto Serif", family: "Noto Serif", weights: [600, 700, 800], stack: "var(--font-poster-noto-serif), 'Noto Serif', Georgia, serif" },
  merriweather: { label: "Merriweather (serif)", family: "Merriweather", weights: [700, 900], stack: "var(--font-poster-merriweather), Merriweather, Georgia, serif" },
  robotoSlab: { label: "Roboto Slab", family: "Roboto Slab", weights: [600, 700, 800], stack: "var(--font-poster-roboto-slab), 'Roboto Slab', Georgia, serif" },
  arabic: { label: "Noto Sans Arabic", family: "Noto Sans Arabic", weights: [600, 700, 800], stack: "var(--font-noto-arabic), 'Noto Sans Arabic', system-ui, sans-serif" },
  cairo: { label: "Cairo (Arabic + English)", family: "Cairo", weights: [600, 700, 800], stack: "var(--font-poster-cairo), Cairo, system-ui, sans-serif" },
  tajawal: { label: "Tajawal (Arabic + English)", family: "Tajawal", weights: [500, 700, 800], stack: "var(--font-poster-tajawal), Tajawal, system-ui, sans-serif" },
} as const satisfies Record<string, { label: string; family: string; weights: readonly number[]; stack: string }>;

export type BrandFont = keyof typeof BRAND_FONTS;
export const BRAND_FONT_IDS = Object.keys(BRAND_FONTS) as BrandFont[];

export const BRAND_TONES = ["friendly", "formal", "energetic"] as const;
export type BrandTone = (typeof BRAND_TONES)[number];

export interface BrandKit {
  /** Logo drawn on the poster. Empty means "use the company logo from the profile". */
  logoUrl?: string;
  /** Company name on posters when it should differ from the profile name (e.g. a short brand name). */
  displayName?: string;
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

/** Mployedin's contact line on posters (owner decision 2026-11-09: Mployedin's only, every brand). */
export interface PosterContact {
  email: string;
  phone: string;
}

export const posterContactSchema = z
  .object({
    email: z.union([z.literal(""), z.string().trim().email("Enter an email like support@mployedin.com").max(254)]),
    phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/, "Use digits, spaces and + ( ) - only"),
  })
  .strict();

export const brandKitSchema = z
  .object({
    logoUrl,
    displayName: z.string().trim().max(60, "Keep the name under 60 characters").optional(),
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
    displayName: stored?.displayName?.trim() || base.displayName || undefined,
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
