/**
 * Whether two job titles describe the same kind of work. Pure.
 *
 * Titles are compared on their significant words. A generic job noun —
 * "engineer", "developer", "manager" — names no line of work on its own: a
 * quality engineer and a backend engineer share only that word, and counting
 * it put a Quality Control Officer at a 90% role fit for a Senior Backend
 * Engineer (client, 2026-10-28). So the words that say what the work is decide;
 * the generic noun counts only when a title has nothing more specific
 * ("Senior Developer").
 */
import { flattenText } from "@/lib/matchScore";

/** Seniority and filler: never what makes two jobs alike. */
const ROLE_STOPWORDS = new Set([
  "senior", "junior", "lead", "principal", "staff", "chief", "head", "assistant",
  "associate", "executive", "officer", "specialist", "trainee", "intern", "the", "and", "for", "with",
  "of", "in", "to", "at", "an", "or", "on", "by", "as", "co", "ltd", "llc",
]);

/** Job nouns that unrelated work shares. */
const GENERIC_ROLE_WORDS = new Set([
  "engineer", "engineering", "developer", "development", "manager", "management", "technician",
  "analyst", "consultant", "administrator", "coordinator", "supervisor", "operator", "representative",
  "worker", "professional", "expert", "designer", "teacher", "agent",
]);

/** Significant words of a title; two-letter acronyms (QA, IT, HR) count. */
export function roleWords(title: string): Set<string> {
  return new Set(
    flattenText(title)
      .split(" ")
      .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !ROLE_STOPWORDS.has(w)),
  );
}

/** True when any of `titles` is the same kind of work as `jobTitle`. */
export function sharesRole(jobTitle: string, titles: readonly string[]): boolean {
  const target = roleWords(jobTitle);
  if (target.size === 0) return false;
  const specific = new Set([...target].filter((w) => !GENERIC_ROLE_WORDS.has(w)));
  const deciding = specific.size > 0 ? specific : target;
  return titles.some((title) => [...roleWords(title)].some((w) => deciding.has(w)));
}
