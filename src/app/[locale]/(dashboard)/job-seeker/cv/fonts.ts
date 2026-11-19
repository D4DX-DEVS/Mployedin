/* ── CV fonts: one set of files for the screen and the PDF ──
   The files live in /public/fonts/cv (Google Fonts, SIL Open Font Licence —
   see the OFL-*.txt files beside them). The preview loads them with
   @font-face (globals.css) and the PDF registers the same files, so a line
   wraps at the same word in both.

   Families carry a "CV " prefix so the page always uses these files, never a
   different version installed on the viewer's computer. */

import type { FontFamily } from "./types";
import { hasArabicScript } from "@/lib/cv/scriptDirection";

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

/**
 * The Arabic face every PDF font stack falls back to. None of the Latin fonts
 * above has an Arabic glyph, so Arabic text drew as blanks. It has Latin
 * letters too, but the Latin face always stays FIRST in a stack: react-pdf
 * picks the face per character (textkit's fontSubstitution), so Latin text
 * keeps the seeker's font and only Arabic falls through to this one. Amiri
 * has no italic: italic runs use the upright files.
 *
 * Why Amiri and not Noto Sans Arabic (the face the site and the invoices
 * use): Noto Sans Arabic and Noto Naskh Arabic split letters like the hamza
 * forms and ba+kaf into glyphs that carry no code point, and react-pdf's
 * right-to-left reordering (textkit 6.3) then throws "Cannot read properties
 * of undefined (reading 'id')" for about a fifth of ordinary Arabic phrases
 * (a name like "bakalorius", "jayyid jiddan"), which fails the whole PDF.
 * Amiri keeps every glyph's code point and rendered all 48 test phrases
 * (cvFontStacks.test.ts guards this property of the files).
 *
 * The files are Amiri with its cursive-attachment lookups (GPOS "curs")
 * emptied and the family renamed "Amiri CV" (scripts/derive-cv-amiri.py,
 * OFL 1.1, licence next to them). react-pdf shapes every run "ltr", and with
 * "curs" fontkit collapses the advance of pairs like meem+hah to 0 that way
 * (664 units read right-to-left): lines were measured too narrow, ran ~5 pt
 * past the margin and the next word was drawn over the pair. The joins still
 * connect; cvFontStacks.test.ts checks "ltr" and "rtl" now measure the same.
 */
export const CV_ARABIC_FONT: CvFont = {
  label: "Amiri",
  family: "CV Amiri",
  file: "amiri",
  generic: "serif",
};

/**
 * Line height (a multiple of the font size) for a text with a FIXED line height that is drawn in the
 * Arabic face. Amiri is tall (ascent 1.124 + descent 0.634 = 1.758 em); a 1.2 line box (the header
 * name) lets its glyphs hang out and over the line below. cvFontStacks.test.ts checks this is at
 * least the height of the shipped files.
 */
export const CV_ARABIC_LINE_HEIGHT = 1.76;

export const CV_FONT_DIR = "/fonts/cv";

export function cvFontFile(font: CvFont, weight: 400 | 700, style: "normal" | "italic"): string {
  return `${CV_FONT_DIR}/${font.file}-${weight}-${style}.ttf`;
}

/** The names a font is registered under with react-pdf: regular (with bold/italic faces), plus bold-only and italic-only families. */
export function pdfFamilyNames(font: CvFont): { regular: string; bold: string; italic: string } {
  return { regular: font.family, bold: `${font.family} Bold`, italic: `${font.family} Italic` };
}

export type PdfFontWeight = "regular" | "bold" | "italic";

/** A standard PDF font (Times, Courier...) with the Arabic face behind it. */
export function withArabicFallback(family: string, weight: PdfFontWeight = "regular"): string[] {
  return [family, pdfFamilyNames(CV_ARABIC_FONT)[weight]];
}

/**
 * The font stacks the templates set as `fontFamily`: the font's own face first,
 * the Arabic face behind it. The registered family names are pdfFamilyNames().
 */
export function pdfFamilies(font: CvFont): { regular: string[]; bold: string[]; italic: string[] } {
  const names = pdfFamilyNames(font);
  return {
    regular: withArabicFallback(names.regular, "regular"),
    bold: withArabicFallback(names.bold, "bold"),
    italic: withArabicFallback(names.italic, "italic"),
  };
}

/**
 * The font for one piece of text. Text with Arabic in it is drawn in the Arabic
 * face ALONE, not in a [Latin, Arabic] stack: with a stack react-pdf takes every
 * space, digit and bracket from the Latin face, cutting an Arabic phrase into
 * one run per word, and its right-to-left reordering then drops or misplaces
 * letters where those runs meet. Amiri has Latin letters, digits and
 * punctuation of its own, so a whole mixed phrase comes from one face. Other
 * text keeps the stack it was given.
 */
export function pdfFontForText(text: string, stack: string[], weight: PdfFontWeight = "regular"): string | string[] {
  return hasArabicScript(text) ? pdfFamilyNames(CV_ARABIC_FONT)[weight] : stack;
}
