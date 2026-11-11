/* Client-safe and pure: the staff lists import this, so nothing here may pull in a model. */

const MAX_TITLE = 70;
const YEAR = "(?:19|20)\\d{2}";
/** Words that say the text after a dash is an employer, not part of the role. */
const COMPANY_MARKER = /\b(ltd|llc|l\.l\.c|pvt|inc|corp|company|co\.|trading|group|est|establishment|enterprises?|industries|contracting)\b/i;

/**
 * A job title as a person would say it. Imported CVs often put the whole
 * line in the title — "Senior Executive Sales – Tulsyan Smelters Pvt. Ltd.,
 * Cochin (2024 – Present)" — which fills a table cell and cannot be searched
 * or grouped. Drops the date range, the employer and the city; leaves a clean
 * title untouched.
 */
export function cleanRoleTitle(raw: string | undefined | null): string {
  let s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // "(2024 – Present)", "(Jan 2020 - Mar 2023)"
  s = s.replace(new RegExp(`\\s*\\([^)]*(?:\\b${YEAR}\\b|present|current)[^)]*\\)`, "gi"), "");
  // A trailing bare date range: "Sales Executive 2019 - 2022"
  s = s.replace(new RegExp(`\\s+${YEAR}\\s*[-–—to]+\\s*(?:${YEAR}|present|current)\\s*$`, "i"), "");
  // "Role – Employer", "Role | Employer", "Role @ Employer"
  s = s.replace(/\s[–—|@]\s.*$/, "");
  // "Role - Employer Ltd" (a plain hyphen can also join two role words, so only with a company marker)
  const hyphen = s.match(/^(.*?)\s-\s(.+)$/);
  if (hyphen && COMPANY_MARKER.test(hyphen[2])) s = hyphen[1];
  s = s.replace(/[\s,;:.-]+$/, "").trim();
  if (s.length > MAX_TITLE) {
    const comma = s.indexOf(",");
    if (comma > 0) s = s.slice(0, comma).trim();
  }
  if (s.length > MAX_TITLE) s = `${s.slice(0, MAX_TITLE).replace(/\s+\S*$/, "")}…`;
  return s;
}
