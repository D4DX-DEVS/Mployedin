/**
 * Talent pool name and tag rules, shared by the API and the dialogs (QA
 * EMP-016, 2026-10-06): a 300-character name got in through edit, which had no
 * limit, and "qa, auto, qa" was stored with the duplicate.
 */

export const POOL_NAME_MIN = 2;
export const POOL_NAME_MAX = 100;
export const POOL_DESCRIPTION_MAX = 500;
export const POOL_TAG_MAX = 40;
export const POOL_TAGS_MAX = 20;

export const POOL_NAME_ERROR = `Pool name must be ${POOL_NAME_MIN}–${POOL_NAME_MAX} characters.`;

/** True when the trimmed name is within the allowed length. */
export function isValidPoolName(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const name = raw.trim();
  return name.length >= POOL_NAME_MIN && name.length <= POOL_NAME_MAX;
}

/**
 * Trimmed, de-duplicated (case-insensitively, keeping the first spelling)
 * tags, each at most POOL_TAG_MAX characters, at most POOL_TAGS_MAX of them.
 */
export function normalizePoolTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const tag = value.trim().slice(0, POOL_TAG_MAX);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === POOL_TAGS_MAX) break;
  }
  return out;
}
