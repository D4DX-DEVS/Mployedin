/**
 * Poster colours: one palette per layout, always picked for contrast against
 * what each part of the poster sits on. Client-safe, no JSX.
 */
import { contrastRatio, readableTextOn, type BrandKit } from "@/lib/brand/brandKit";
import type { BrandLayout, PosterLook } from "./BrandPoster";

export const ART_LAYOUTS = ["wave", "slant", "statement", "card", "orbit", "global"] as const;
export type ArtLayout = (typeof ART_LAYOUTS)[number];

export function isArtLayout(layout: string): layout is ArtLayout {
  return (ART_LAYOUTS as readonly string[]).includes(layout);
}

/**
 * Layouts that spend room on art draw everything a touch smaller on the square
 * and LinkedIn sizes, so four requirements and a two-line title still fit.
 */
export function artScale(layout: string, tall: boolean): number {
  if (tall || !isArtLayout(layout)) return 1;
  return layout === "global" ? 0.97 : 0.94;
}

/** Mix a #rrggbb colour toward black (amount 0–1); returns #rrggbb. */
export function darken(color: string, amount: number): string {
  const c = (i: number) =>
    Math.round(parseInt(color.slice(i, i + 2), 16) * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${c(1)}${c(3)}${c(5)}`;
}

/** #rrggbb with alpha, as rgba(). */
export function alpha(color: string, a: number): string {
  const c = (i: number) => parseInt(color.slice(i, i + 2), 16);
  return `rgba(${c(1)}, ${c(3)}, ${c(5)}, ${a})`;
}

export interface Palette {
  background: string;
  titleFg: string;
  bodyFg: string;
  metaFg: string;
  metaBg: string;
  mutedFg: string;
  ctaFg: string;
  kickerBg: string;
  kickerFg: string;
  /** Icons, the requirements heading and the QR frame. */
  iconFg: string;
  buttonBg: string;
  buttonFg: string;
  ruleFg: string;
  align: "left" | "center";
}

/** Text colour on the kit background: the kit's text colour, or white on a dark background. */
function textOnBackground(kit: BrandKit): string {
  return readableTextOn(kit.background) === "#ffffff" ? "#ffffff" : kit.text;
}

/** The requirements, QR and apply bar when they sit on the kit background (or a card in it). */
function lightBottom(kit: BrandKit): Pick<Palette, "ctaFg" | "mutedFg" | "iconFg" | "buttonBg" | "buttonFg" | "ruleFg"> {
  const text = textOnBackground(kit);
  return {
    ctaFg: text,
    mutedFg: alpha(text, 0.65),
    iconFg: contrastRatio(kit.primary, kit.background) >= 3 ? kit.primary : text,
    buttonBg: kit.primary,
    buttonFg: readableTextOn(kit.primary),
    ruleFg: alpha(text, 0.15),
  };
}

/** Company, kicker, title and chips sitting on the brand colour. */
function onPrimary(kit: BrandKit, look: PosterLook): Pick<Palette, "titleFg" | "bodyFg" | "metaFg" | "metaBg" | "kickerBg" | "kickerFg"> {
  const fg = readableTextOn(kit.primary);
  const light = fg === "#ffffff";
  return {
    titleFg: fg,
    bodyFg: fg,
    metaFg: fg,
    metaBg: light ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
    kickerBg: look === "urgent" ? kit.accent : light ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)",
    kickerFg: look === "urgent" ? readableTextOn(kit.accent) : fg,
  };
}

/** Colours for each art layout, picked for contrast against what each part sits on. */
function artPalette(layout: ArtLayout, kit: BrandKit, look: PosterLook): Palette {
  const brandGradient = `linear-gradient(155deg, ${kit.primary} 0%, ${darken(kit.primary, 0.45)} 100%)`;
  const text = textOnBackground(kit);
  switch (layout) {
    case "statement":
      return { background: brandGradient, ...onPrimary(kit, look), ...lightBottom(kit), align: "left" };
    case "card":
      return {
        background: brandGradient,
        ...onPrimary(kit, look),
        // Title and chips sit in the card; the company and kicker stay on the brand colour above it.
        titleFg: text,
        metaFg: text,
        metaBg: alpha(kit.primary, 0.08),
        ...lightBottom(kit),
        align: "left",
      };
    case "orbit":
      return {
        background: kit.background,
        titleFg: text,
        bodyFg: text,
        metaFg: text,
        metaBg: alpha(kit.primary, 0.08),
        kickerBg: look === "urgent" ? kit.accent : alpha(kit.primary, 0.12),
        kickerFg: look === "urgent" ? readableTextOn(kit.accent) : contrastRatio(kit.primary, kit.background) >= 4.5 ? kit.primary : text,
        ...lightBottom(kit),
        align: "left",
      };
    case "global": {
      const surface = darken(kit.primary, 0.5);
      return {
        background: `linear-gradient(160deg, ${darken(kit.primary, 0.62)} 0%, ${darken(kit.primary, 0.36)} 100%)`,
        titleFg: "#ffffff",
        bodyFg: "#ffffff",
        metaFg: "#ffffff",
        metaBg: "rgba(255,255,255,0.12)",
        mutedFg: "rgba(255,255,255,0.72)",
        ctaFg: "#ffffff",
        kickerBg: kit.accent,
        kickerFg: readableTextOn(kit.accent),
        iconFg: contrastRatio(kit.accent, surface) >= 3 ? kit.accent : "#ffffff",
        buttonBg: kit.accent,
        buttonFg: readableTextOn(kit.accent),
        ruleFg: "rgba(255,255,255,0.18)",
        align: "left",
      };
    }
    case "wave":
    case "slant":
    default:
      return { background: kit.background, ...onPrimary(kit, look), ...lightBottom(kit), align: "left" };
  }
}

type ClassicLayout = Exclude<BrandLayout, ArtLayout>;

/** The palette for any layout. */
export function paletteFor(layout: BrandLayout, kit: BrandKit, look: PosterLook): Palette {
  return isArtLayout(layout) ? artPalette(layout, kit, look) : classicPalette(layout, kit, look);
}

type BasePalette = Omit<Palette, "iconFg" | "buttonBg" | "buttonFg" | "ruleFg">;

/** #rrggbb or white/black for a colour that may be an rgba() string. */
function solid(color: string): string {
  return color.startsWith("#") ? color : "#ffffff";
}

/**
 * Colours for each layout, always picked for contrast against what they sit on.
 * The extras (icons, the Apply button, the divider) follow the area the bottom
 * of the poster sits on: the brand colour for light layouts, white/accent on dark ones.
 */
function classicPalette(layout: ClassicLayout, kit: BrandKit, look: PosterLook): Palette {
  const base = basePalette(layout, kit, look);
  const onPrimary = readableTextOn(kit.primary);
  const dark = layout === "spotlight" || layout === "night";
  if (layout === "night") {
    const accentOk = contrastRatio(kit.accent, "#0b1328") >= 3;
    return { ...base, iconFg: accentOk ? kit.accent : "#ffffff", buttonBg: kit.accent, buttonFg: readableTextOn(kit.accent), ruleFg: "rgba(255,255,255,0.18)" };
  }
  if (dark) {
    const lightText = onPrimary === "#ffffff";
    return {
      ...base,
      iconFg: contrastRatio(kit.accent, kit.primary) >= 3 ? kit.accent : onPrimary,
      buttonBg: lightText ? "#ffffff" : kit.text,
      buttonFg: lightText ? kit.primary : "#ffffff",
      ruleFg: lightText ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
    };
  }
  const text = solid(base.ctaFg);
  return {
    ...base,
    iconFg: contrastRatio(kit.primary, kit.background) >= 3 ? kit.primary : text,
    buttonBg: kit.primary,
    buttonFg: onPrimary,
    ruleFg: alpha(text, 0.15),
  };
}

function basePalette(layout: ClassicLayout, kit: BrandKit, look: PosterLook): BasePalette {
  const urgentKicker = look === "urgent";
  const onPrimary = readableTextOn(kit.primary);
  const onBackground = readableTextOn(kit.background);
  const onAccent = readableTextOn(kit.accent);
  const titleOnBackground = readableTextOn(kit.background) === "#ffffff" ? "#ffffff" : kit.text;

  switch (layout) {
    case "band":
      return {
        background: kit.background,
        titleFg: titleOnBackground,
        bodyFg: onPrimary,
        metaFg: titleOnBackground,
        metaBg: alpha(kit.primary, 0.1),
        mutedFg: alpha(onBackground === "#ffffff" ? "#ffffff" : kit.text, 0.65),
        ctaFg: titleOnBackground,
        kickerBg: urgentKicker ? kit.accent : "rgba(255,255,255,0.18)",
        kickerFg: urgentKicker ? onAccent : onPrimary,
        align: "left",
      };
    case "split":
      return {
        background: kit.background,
        titleFg: onPrimary,
        bodyFg: titleOnBackground,
        metaFg: titleOnBackground,
        metaBg: alpha(kit.primary, 0.1),
        mutedFg: alpha(onBackground === "#ffffff" ? "#ffffff" : kit.text, 0.65),
        ctaFg: titleOnBackground,
        kickerBg: urgentKicker ? kit.accent : "rgba(255,255,255,0.18)",
        kickerFg: urgentKicker ? onAccent : onPrimary,
        align: "left",
      };
    case "frame":
      return {
        background: kit.background,
        titleFg: titleOnBackground,
        bodyFg: titleOnBackground,
        metaFg: titleOnBackground,
        metaBg: alpha(kit.accent, 0.14),
        mutedFg: alpha(onBackground === "#ffffff" ? "#ffffff" : kit.text, 0.65),
        ctaFg: titleOnBackground,
        kickerBg: urgentKicker ? kit.accent : kit.primary,
        kickerFg: urgentKicker ? onAccent : onPrimary,
        align: "center",
      };
    case "night": {
      const dark = readableTextOn(kit.text) === "#ffffff" ? kit.text : "#0b1328";
      return {
        background: `linear-gradient(180deg, ${dark}, ${darken(dark.startsWith("#") ? dark : "#0b1328", 0.4)})`,
        titleFg: "#ffffff",
        bodyFg: "#ffffff",
        metaFg: "#ffffff",
        metaBg: "rgba(255,255,255,0.12)",
        mutedFg: "rgba(255,255,255,0.7)",
        ctaFg: "#ffffff",
        kickerBg: kit.accent,
        kickerFg: onAccent,
        align: "left",
      };
    }
    case "minimal":
      return {
        background: kit.background,
        titleFg: titleOnBackground,
        bodyFg: titleOnBackground,
        metaFg: titleOnBackground,
        metaBg: "rgba(0,0,0,0)",
        mutedFg: alpha(onBackground === "#ffffff" ? "#ffffff" : kit.text, 0.6),
        ctaFg: titleOnBackground,
        kickerBg: urgentKicker ? kit.accent : alpha(kit.primary, 0.12),
        kickerFg: urgentKicker ? onAccent : readableTextOn(kit.background) === "#ffffff" ? "#ffffff" : kit.primary,
        align: "left",
      };
    case "spotlight":
    default:
      return {
        background: `linear-gradient(150deg, ${kit.primary} 0%, ${darken(kit.primary, 0.45)} 75%)`,
        titleFg: onPrimary,
        bodyFg: onPrimary,
        metaFg: onPrimary,
        metaBg: "rgba(255,255,255,0.14)",
        mutedFg: onPrimary === "#ffffff" ? "rgba(255,255,255,0.72)" : "rgba(17,24,39,0.7)",
        ctaFg: onPrimary,
        kickerBg: urgentKicker ? kit.accent : "rgba(255,255,255,0.18)",
        kickerFg: urgentKicker ? onAccent : onPrimary,
        align: "left",
      };
  }
}
