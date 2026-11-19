/* ── Which way does a CV read? ──
   Arabic is written right to left. A CV whose name and summary are mainly
   Arabic is laid out right to left (Classic template); one that only has an
   Arabic company name or skill stays left to right, but its Arabic still
   draws (font fallback) and orders correctly (bidi). Pure, so it is testable
   without react-pdf. */

import type { CVForm } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";

const LETTER = /\p{L}/u;
// Arabic, Arabic Supplement, Extended-A, and both presentation-form blocks.
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** True when the text has at least one Arabic-script character. */
export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

/**
 * The share of the text's letters that are Arabic (0 to 1). Digits, spaces,
 * punctuation and combining marks (harakat) are not letters; 0 when there are
 * no letters at all.
 */
export function arabicLetterShare(text: string): number {
  let letters = 0;
  let arabic = 0;
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    letters += 1;
    if (ARABIC_SCRIPT.test(ch)) arabic += 1;
  }
  return letters === 0 ? 0 : arabic / letters;
}

/**
 * True when MORE than half of the letters in the candidate's name and summary
 * are Arabic. `headline` holds the summary (the profile's summary, or its
 * headline when there is no summary).
 */
export function isRtlCv(cv: Pick<CVForm, "fullName" | "headline">): boolean {
  return arabicLetterShare(`${cv.fullName} ${cv.headline}`) > 0.5;
}

/**
 * True when anything a CV PDF prints contains Arabic: the form (name, entries,
 * skills, links...) or the section labels. Arabic is the only text that
 * needs the Arabic font and the right-to-left reordering, so it is what
 * decides whether fonts must be parsed afresh (renderCvPdf.ts) and whether a
 * stored PDF predates the Arabic fixes (built-cv.ts).
 */
export function cvHasArabic(input: { data: unknown; labels?: unknown }): boolean {
  return hasArabicScript(JSON.stringify([input.data, input.labels ?? null]));
}
