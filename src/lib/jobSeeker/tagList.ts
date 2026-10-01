/**
 * Tag lists (skills, preferred roles) read from a stored profile, in the shape
 * PATCH /api/job-seeker/profile accepts. The 2026-06-02 bulk import joined
 * whole lists into one entry ("A; B | C"), longer than the validator allows,
 * so every save that sent the list back failed.
 */

export const MAX_SKILL_LENGTH = 100;
const MAX_SKILLS = 50;

interface TagListLimits {
  maxLength: number;
  maxCount: number;
}

/** Split over-long imported entries back into tags, drop bullets and repeats, clip to the limits. */
export function cleanTagList(value: unknown, { maxLength, maxCount }: TagListLimits): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const parts = entry.length > maxLength
      ? entry.split(/[;\n•|]/).flatMap((part) => (part.length > maxLength ? part.split(",") : [part]))
      : [entry];
    for (const part of parts) {
      const tag = part.replace(/^[\s•\-–]+/, "").trim().slice(0, maxLength).trim();
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.slice(0, maxCount);
}

export function cleanSkills(value: unknown): string[] {
  return cleanTagList(value, { maxLength: MAX_SKILL_LENGTH, maxCount: MAX_SKILLS });
}
