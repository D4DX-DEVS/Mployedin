/**
 * Filling in the skills employers did not type.
 *
 * 22 of 62 live jobs carry no `requirements.skills` at all. Skill fit is 60%
 * of the relevance score, so those jobs sit permanently at the no-evidence
 * floor and can never clear a high threshold — they are effectively invisible
 * to the recommendation engine no matter how good the candidate.
 *
 * The description almost always says what the job needs; it is just prose. So
 * this is the one job in the pipeline an LLM is genuinely better at than
 * arithmetic: read the description, return a list. It runs on the write path
 * (job publish, plus a backfill script), never during scoring, and the result
 * is stored — so the daily cron still makes zero AI calls per pair.
 *
 * Extracted skills are written to `requirements.aiSkills`, never over the
 * employer's own `requirements.skills`. A human's stated requirement outranks
 * a model's guess, and keeping them apart means the extraction can be redone
 * or thrown away without data loss.
 */

import logger from "@/lib/logger";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";

/** Cap so one verbose description cannot dominate the prompt budget. */
const MAX_DESCRIPTION_CHARS = 6000;
const MAX_SKILLS = 12;

export interface ExtractedSkills {
  skills: string[];
  /** Skills the description frames as optional. */
  preferred: string[];
}

const EMPTY: ExtractedSkills = { skills: [], preferred: [] };

function buildPrompt(title: string, description: string, existing: string[]): string {
  return [
    "You are reading a job posting and listing the concrete skills it requires.",
    "",
    `Job title: ${title}`,
    existing.length ? `Skills the employer already listed: ${existing.join(", ")}` : "",
    "",
    "Job description:",
    description.slice(0, MAX_DESCRIPTION_CHARS),
    "",
    "Return JSON of the form {\"skills\":[...],\"preferred\":[...]}.",
    `- "skills" holds up to ${MAX_SKILLS} skills the posting treats as required.`,
    '- "preferred" holds skills it frames as a bonus or "nice to have".',
    "- Use the short, conventional name for each skill (\"React\", not \"experience building React applications\").",
    "- Include concrete tools, technologies, certifications and named professional competencies.",
    "- Do not invent skills the description does not support.",
    "- Do not repeat a skill the employer already listed.",
    "- Omit generic filler such as \"hard working\" or \"team player\".",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Keep only plausible skill strings, de-duplicated case-insensitively. */
function cleanSkillList(value: unknown, seen: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const skill = raw.trim().replace(/\s+/g, " ");
    // A "skill" longer than this is a sentence the model failed to compress.
    if (skill.length < 2 || skill.length > 60) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

/**
 * Extract the skills a job description implies.
 *
 * Returns empty lists rather than throwing: this runs on the job-publish path
 * and during a bulk backfill, and neither should fail because the AI provider
 * is unreachable or out of credit.
 */
export async function extractJobSkills(job: {
  title?: string;
  description?: string;
  requirements?: { skills?: string[] };
}): Promise<ExtractedSkills> {
  const description = (job.description ?? "").trim();
  const title = (job.title ?? "").trim();
  if (description.length < 80) return EMPTY;

  const existing = job.requirements?.skills ?? [];

  let raw: string;
  try {
    raw = await generateText(buildPrompt(title, description, existing), GEMINI_MODELS.flash, 400, true);
  } catch (err) {
    logger.warn({ err, title }, "[jobSkillExtraction] provider call failed");
    return EMPTY;
  }

  try {
    const parsed = JSON.parse(raw) as { skills?: unknown; preferred?: unknown };
    // One `seen` set across both lists so a skill cannot be both required and
    // preferred, and so nothing the employer already typed is duplicated.
    const seen = new Set(existing.map((s) => s.toLowerCase().trim()));
    const skills = cleanSkillList(parsed.skills, seen);
    const preferred = cleanSkillList(parsed.preferred, seen);
    return { skills, preferred };
  } catch (err) {
    logger.warn({ err, sample: raw.slice(0, 200) }, "[jobSkillExtraction] unparseable response");
    return EMPTY;
  }
}

/**
 * The skills the matcher should use for a job: the employer's own if they
 * typed any, otherwise whatever was extracted.
 *
 * Callers use this instead of reading `requirements.skills` directly so the
 * precedence rule lives in exactly one place.
 */
export function effectiveJobSkills(job: {
  requirements?: { skills?: string[]; aiSkills?: string[]; preferredSkills?: string[]; aiPreferredSkills?: string[] };
}): { skills: string[]; preferredSkills: string[] } {
  const req = job.requirements ?? {};
  const stated = req.skills ?? [];
  const statedPreferred = req.preferredSkills ?? [];
  return {
    skills: stated.length > 0 ? stated : (req.aiSkills ?? []),
    preferredSkills: statedPreferred.length > 0 ? statedPreferred : (req.aiPreferredSkills ?? []),
  };
}
