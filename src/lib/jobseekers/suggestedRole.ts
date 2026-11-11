/**
 * A best guess at the role of a seeker who has stated none, from their skills.
 * Pure — the index it reads is built from the platform's own data by
 * suggestedRole.server.ts.
 *
 * The idea: people and posted jobs that share a skill tend to share a kind of
 * work ("Driving", "Logistics" → driver). Titles are free text and rarely
 * repeat, so evidence is pooled on the deciding word of a title ("accountant",
 * "driver", "electrician"), not the whole title. A word counts for a skill only
 * when it clearly dominates that skill — "AutoCAD" appears under so many roles
 * that it says nothing — and a guess needs enough weight behind it. When the
 * skills do not agree the answer is "no suggestion". Shown as a guess; never
 * used for search or matching.
 */
import { roleKey } from "@/lib/matching/roleMatch";
import { cleanRoleTitle } from "@/lib/jobseekers/roleTitle";

interface SkillEvidence {
  /** Titles seen with this skill. */
  total: number;
  /** Deciding word → titles containing it, with how often each was seen. */
  words: Map<string, Map<string, number>>;
}

/** skill (lower case) → what it has been seen with. */
export type SkillRoleIndex = Map<string, SkillEvidence>;

/** A skill needs at least this many titles behind it to vote at all. */
const MIN_SKILL_TITLES = 5;
/** A word must be in at least this share of a skill's titles to count for it. */
const MIN_SHARE = 0.5;
/** Total weight a role word needs from the seeker's skills before it is suggested. */
const MIN_SCORE = 1.2;
/** Skills of one seeker that get a vote. */
const MAX_SKILLS = 8;

const normSkill = (skill: string) => skill.trim().toLowerCase();

/** Record that someone (or a job) with these skills holds/wants/asks for this title. */
export function addRoleEvidence(index: SkillRoleIndex, skills: readonly string[], rawTitle: string | undefined): void {
  const title = cleanRoleTitle(rawTitle);
  if (!title || title.length > 50) return;
  const key = roleKey(title);
  if (!key) return;
  const words = key.split(" ");
  for (const skill of new Set(skills.map(normSkill).filter(Boolean))) {
    let evidence = index.get(skill);
    if (!evidence) index.set(skill, (evidence = { total: 0, words: new Map() }));
    evidence.total += 1;
    for (const word of words) {
      let titles = evidence.words.get(word);
      if (!titles) evidence.words.set(word, (titles = new Map()));
      titles.set(title, (titles.get(title) ?? 0) + 1);
    }
  }
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/**
 * The most likely role for these skills, in the wording most people use for
 * it, or undefined when the skills do not agree on one.
 */
export function suggestRoleFromSkills(skills: readonly string[], index: SkillRoleIndex): string | undefined {
  const own = [...new Set(skills.map(normSkill).filter(Boolean))].slice(0, MAX_SKILLS);
  const score = new Map<string, number>();
  const used: SkillEvidence[] = [];
  for (const skill of own) {
    const evidence = index.get(skill);
    if (!evidence || evidence.total < MIN_SKILL_TITLES) continue;
    used.push(evidence);
    for (const [word, titles] of evidence.words) {
      const share = sum(titles) / evidence.total;
      if (share >= MIN_SHARE) score.set(word, (score.get(word) ?? 0) + share);
    }
  }
  const best = [...score.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
  if (!best || best[1] < MIN_SCORE) return undefined;

  // Wording: the title containing the winning word that the seeker's skills saw most.
  const counts = new Map<string, number>();
  for (const evidence of used) {
    for (const [title, n] of evidence.words.get(best[0]) ?? []) counts.set(title, (counts.get(title) ?? 0) + n);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0];
}
