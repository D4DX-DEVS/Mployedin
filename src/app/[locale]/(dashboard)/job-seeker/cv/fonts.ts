/* ── CV fonts: one set of files for the screen and the PDF ──
   The files live in /public/fonts/cv (Google Fonts, SIL Open Font Licence —
   see the OFL-*.txt files beside them). The preview loads them with
   @font-face (globals.css) and the PDF registers the same files, so a line
   wraps at the same word in both.

   Families carry a "CV " prefix so the page always uses these files, never a
   different version installed on the viewer's computer. */

import type { FontFamily } from "./types";

export interface CvFont {
  /** Name the seeker sees in the picker. */
  label: string;
  /** CSS + PDF family name. */
  family: string;
  /** File name stem in /public/fonts/cv: <stem>-<weight>-<style>.ttf */
  file: string;
  /** Generic fallback for the CSS stack. */
  generic: "sans-serif" | "serif";
}

/**
 * Keyed by the stored font id. "georgia" is kept as the id so saved designs
 * still load, but it is drawn with Lora: Georgia is a Microsoft font that may
 * not be embedded in a PDF, and Lora is the closest free match.
 */
export const CV_FONTS_BY_ID: Record<FontFamily, CvFont> = {
  inter:        { label: "Inter",            family: "CV Inter",            file: "inter",            generic: "sans-serif" },
  roboto:       { label: "Roboto",           family: "CV Roboto",           file: "roboto",           generic: "sans-serif" },
  georgia:      { label: "Lora",             family: "CV Lora",             file: "lora",             generic: "serif" },
  merriweather: { label: "Merriweather",     family: "CV Merriweather",     file: "merriweather",     generic: "serif" },
  playfair:     { label: "Playfair Display", family: "CV Playfair Display", file: "playfair-display", generic: "serif" },
};

export const CV_FONT_DIR = "/fonts/cv";

export function cvFontFile(font: CvFont, weight: 400 | 700, style: "normal" | "italic"): string {
  return `${CV_FONT_DIR}/${font.file}-${weight}-${style}.ttf`;
}

/** PDF family names: regular (with bold/italic faces), plus bold-only and italic-only families. */
export function pdfFamilies(font: CvFont): { regular: string; bold: string; italic: string } {
  return { regular: font.family, bold: `${font.family} Bold`, italic: `${font.family} Italic` };
}
