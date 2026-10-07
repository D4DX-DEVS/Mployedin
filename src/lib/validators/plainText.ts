/**
 * Fields that are shown as plain text (job titles) must not carry markup. React
 * escapes it, so "<b>Engineer</b>" was never an XSS, but it showed the tags to
 * every candidate (QA EMP-011, 2026-10-06).
 */

// A tag-like run such as <b>, </div>, <img src=x> or <!-- -->. "C++ < 5 yrs" is not one.
const MARKUP_PATTERN = /<\/?[a-z!][^>]*>/i;

export const PLAIN_TEXT_ERROR = "Use plain text, without HTML tags";

export function containsMarkup(value: string): boolean {
  return MARKUP_PATTERN.test(value);
}
