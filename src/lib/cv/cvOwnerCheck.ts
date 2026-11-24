/**
 * Does an uploaded CV look like it belongs to someone else?
 *
 * 2026-11-24: a seeker could upload a friend's CV and the one-step fill
 * (onboarding, Easy Apply) put the friend's name and whole work history on
 * their account. Nothing compared the CV with the account.
 *
 * The check is deliberately cautious: it only says "someone else" when both
 * names are in the same script and share too few words. A matching email
 * settles it the other way. Anything it cannot judge (no name, Arabic on one
 * side and English on the other) counts as the seeker's own CV. A false alarm
 * costs the seeker one click ("It's my CV"); a missed one is the old behaviour.
 */

export interface CvOwnerMismatch {
  /** The name the CV gives. */
  cvName: string;
  /** The name on the account. */
  accountName: string;
  /** The CV's email, when it has one and it is not the account's. */
  cvEmail: string | null;
}

export interface CvOwnerInput {
  accountName?: string | null;
  accountEmail?: string | null;
  cvName?: string | null;
  cvEmail?: string | null;
}

/** Words that say nothing about who someone is. */
const PARTICLES = new Set([
  "al", "el", "bin", "ben", "ibn", "bint", "abu", "abo", "de", "da", "van", "von", "der",
  "mr", "mrs", "ms", "miss", "dr", "eng", "engr",
  "بن", "ابن", "بنت", "ابو",
]);

/** Short forms of Mohammed seen on CVs, read as the full name. */
const MOHAMMED_SHORT = new Set(["md", "mohd", "muhd", "mhd", "mohd."]);

const ARABIC = /[؀-ۿ]/;
const LATIN = /[a-z]/;

function normalize(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // Latin accents
    .replace(/[ً-ٰٟـ]/g, "") // Arabic diacritics and tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase();
}

function words(name: string): string[] {
  return normalize(name)
    .split(/[^a-z؀-ۿ]+/)
    .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
    .filter((w) => w.length >= 2 && !PARTICLES.has(w));
}

/**
 * The word without its vowels and doubled letters, so spellings of one name
 * meet: Mohammed / Muhammad / Mohamed → "mhmd", Yousef / Yusuf → "ysf".
 */
function skeleton(word: string): string {
  if (MOHAMMED_SHORT.has(word)) return "mhmd";
  const vowels = ARABIC.test(word) ? /[اوي]/g : /[aeiouy]/g;
  const rest = word.slice(1).replace(vowels, "");
  return (word[0] + rest).replace(/(.)\1+/g, "$1");
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = skeleton(a);
  return sa.length >= 3 && sa === skeleton(b);
}

function scriptOf(name: string): Set<"arabic" | "latin"> {
  const n = normalize(name);
  const scripts = new Set<"arabic" | "latin">();
  if (ARABIC.test(n)) scripts.add("arabic");
  if (LATIN.test(n)) scripts.add("latin");
  return scripts;
}

/** True when the two names read as the same person (or cannot be compared). */
export function namesMatch(accountName: string, cvName: string): boolean {
  const accountScripts = scriptOf(accountName);
  const cvScripts = scriptOf(cvName);
  const shared = [...accountScripts].some((s) => cvScripts.has(s));
  if (!shared) return true; // "محمد علي" vs "Mohammed Ali": not comparable here

  const a = words(accountName);
  const c = words(cvName);
  if (!a.length || !c.length) return true;

  const overlap = a.filter((w) => c.some((v) => sameWord(w, v))).length;
  // One shared word is enough for a one-word name; otherwise two, so
  // "Mohammed Ali" and "Mohammed Khan" are not taken for one person.
  return overlap >= Math.min(2, a.length, c.length);
}

/** The mismatch to show the seeker, or null when the CV reads as theirs. */
export function cvOwnerMismatch(input: CvOwnerInput): CvOwnerMismatch | null {
  const accountEmail = input.accountEmail?.trim().toLowerCase() || "";
  const cvEmail = input.cvEmail?.trim().toLowerCase() || "";
  if (accountEmail && cvEmail && accountEmail === cvEmail) return null;

  const accountName = input.accountName?.trim() || "";
  const cvName = input.cvName?.trim() || "";
  if (!accountName || !cvName) return null;
  if (namesMatch(accountName, cvName)) return null;

  return { cvName, accountName, cvEmail: cvEmail || null };
}
