/**
 * Contact details read off a CV, checked before anything uses them.
 *
 * In the 2026-10-15 OCR test both Gemini and Qwen got one email wrong in 10
 * CVs. A value that fails here is dropped, never repaired: an empty field the
 * seeker fills in beats a confident wrong one an employer writes to.
 *
 * Text from Arabic CVs brings invisible direction marks and Arabic digits, and
 * a full stop, bracket, quote or label often touches an address. Those are
 * cleaned so a correct value is not dropped. An email is read in two passes:
 * first with only the spaces around "@" joined, and only if that finds nothing,
 * again with a space before a dot joined too ("gmail . com"). So an address
 * that reads fine as written is never fused with the word after a spaced full
 * stop ("name@x.com . Phone"), and a full stop followed by a space
 * ("Dubai. john@x.com") is a sentence end that is never joined.
 *
 * Known limits: a misread that still looks valid (one wrong letter) passes;
 * when the first pass finds nothing, " . " or " .x" before a word is read as an
 * OCR split, so "Dubai .john@x.com" becomes "Dubai.john@x.com". A field over
 * 320 characters is dropped, which also bounds the cost of the regexes.
 * Phone numbers are only screened for a plausible number; onboarding parses
 * them properly with libphonenumber (splitCvPhone).
 */

export interface ContactInput {
  email?: unknown;
  phone?: unknown;
}

export interface CleanedContact {
  email?: string;
  phone?: string;
  dropped: ("email" | "phone")[];
}

/** No real email or phone field is longer; longer text is a misread paragraph. */
const MAX_FIELD_LENGTH = 320;
const EMAIL = /^[A-Za-z0-9_%+'-][A-Za-z0-9._%+'-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;
/** Between two addresses: whitespace, commas, semicolons (Arabic ones too), "/" and "|". */
const EMAIL_SEPARATORS = /[\s,;/|\u060C\u061B]+/;
/** Digits with spaces, brackets, dots and any dash (U+2010-2015, minus U+2212) between them. */
const PHONE_RUN = /\+?\d[\d\s().\u2010-\u2015\u2212-]{6,}\d/g;
/** The shortest national numbers in the Gulf (Bahrain, Qatar, Kuwait, Oman) have 8 digits. */
const MIN_PHONE_DIGITS = 8;
/** Zero-width characters, direction and letter marks, soft hyphen, byte-order mark: unseen, but they break matching. */
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
/**
 * Punctuation that wraps an address in running text: brackets, quotes (straight,
 * curly, guillemets), a bullet and a colon. A full stop ends an address but
 * never starts one: ".john@x.com" is not repaired into "john@x.com".
 */
const LEADING_EDGE = /^[()<>[\]{}"':,;\u201C\u201D\u00AB\u00BB\u2039\u203A\u2022]+/;
const TRAILING_EDGE = /[()<>[\]{}"':,;.\u201C\u201D\u00AB\u00BB\u2039\u203A\u2022]+$/;
/** Arabic-Indic (U+0660-0669) and Persian (U+06F0-06F9) digits. */
const NON_ASCII_DIGIT = /[\u0660-\u0669\u06F0-\u06F9]/g;

function toAsciiDigit(digit: string): string {
  const code = digit.charCodeAt(0);
  return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
}

function trimEdges(text: string): string {
  return text.replace(LEADING_EDGE, "").replace(TRAILING_EDGE, "");
}

/** One word of the value, without wrapping punctuation or a label glued on with a colon. */
function addressOf(token: string): string {
  const bare = trimEdges(token);
  // "Email:name@x.com" and "mailto:name@x.com": the address is after the last colon.
  return trimEdges(bare.includes("@") ? bare.slice(bare.lastIndexOf(":") + 1) : bare);
}

function firstAddress(text: string): string | undefined {
  return text
    .split(EMAIL_SEPARATORS)
    .map(addressOf)
    .find((address) => EMAIL.test(address) && !address.includes(".."));
}

function firstValidEmail(text: string): string | undefined {
  // OCR puts spaces around "@"; an address itself never has spaces.
  const atJoined = text.replace(/\s*@\s*/g, "@");
  // Only when that finds nothing, join a dot with a space before it as well.
  return firstAddress(atJoined) ?? firstAddress(atJoined.replace(/\s+\.\s*/g, "."));
}

/** The phone as given (ASCII digits) when it holds a plausible number, else undefined. */
function plausiblePhone(text: string): string | undefined {
  const phone = text.replace(NON_ASCII_DIGIT, toAsciiDigit);
  const plausible = (phone.match(PHONE_RUN) ?? []).some((run) => run.replace(/\D/g, "").length >= MIN_PHONE_DIGITS);
  return plausible ? phone : undefined;
}

/** undefined: nothing there to check. null: failed the check. A string: the cleaned value. */
function readField(value: unknown, check: (text: string) => string | undefined): string | null | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length > MAX_FIELD_LENGTH) return null;
  const text = value.replace(INVISIBLE, "").trim();
  if (!text) return undefined;
  return check(text) ?? null;
}

export function cleanContact(input: ContactInput): CleanedContact {
  const result: CleanedContact = { dropped: [] };

  const email = readField(input.email, firstValidEmail);
  if (email) result.email = email;
  else if (email === null) result.dropped.push("email");

  const phone = readField(input.phone, plausiblePhone);
  if (phone) result.phone = phone;
  else if (phone === null) result.dropped.push("phone");

  return result;
}
