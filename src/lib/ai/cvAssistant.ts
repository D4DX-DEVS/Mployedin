import type { AiCvAssistantInput } from "@/lib/validators/ai";

/**
 * The CV builder's one AI assistant (client sheet 2026-10-27: "replace the
 * repetitive AI buttons under each field with a single chat that edits,
 * improves, rewrites and tailors the whole CV").
 *
 * The model proposes; the seeker applies. It may reword the summary, the
 * skills list and the experience / project descriptions. Titles, employers,
 * dates, education and certifications are facts: they go in as context and
 * can never come back changed.
 */
export interface CvAssistantChanges {
  summary?: string;
  skills?: string[];
  experience?: { index: number; description: string }[];
  projects?: { index: number; description: string }[];
}

export interface CvAssistantResult {
  reply: string;
  changes: CvAssistantChanges;
}

const LIMITS = { reply: 1500, summary: 1000, description: 4000, skill: 80, skills: 50 } as const;

export function buildCvAssistantPrompt({ instruction, history, cv }: AiCvAssistantInput): string {
  const numbered = {
    summary: cv.summary,
    skills: cv.skills,
    experience: cv.experience.map((e, index) => ({ index, ...e })),
    projects: cv.projects.map((p, index) => ({ index, ...p })),
    education: cv.education,
    certifications: cv.certifications,
  };
  const transcript = history.map((m) => `${m.role === "user" ? "Candidate" : "Assistant"}: ${m.content}`).join("\n");

  return `You are a professional CV writer helping a candidate edit their own CV through chat.

The candidate's current CV (JSON):
${JSON.stringify(numbered)}
${transcript ? `\nEarlier in this conversation:\n${transcript}\n` : ""}
The candidate's request:
${instruction}

Rules:
- Only change what the request asks for. If it is a question, answer it and change nothing.
- You may change ONLY: "summary", "skills", and the "description" of experience or project entries (by their index).
- Never change or invent job titles, employers, dates, education, certifications or contact details.
- Never invent metrics, employers, tools or achievements that are not in the CV. If the request needs facts you do not have, say what is missing in "reply" instead.
- Descriptions are plain text; write bullet points as lines starting with "- ".
- If the request includes a job description, tailor wording and skill order toward it using only experience the CV supports.
- Write in the same language as the request.
- Leave a field out of "changes" when you are not changing it.

Respond with JSON only, in this shape:
{"reply": "<one or two sentences telling the candidate what you changed or answering them>",
 "changes": {"summary": "<new summary>", "skills": ["<skill>"], "experience": [{"index": 0, "description": "<new text>"}], "projects": [{"index": 0, "description": "<new text>"}]}}`;
}

const asText = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

function indexed(value: unknown, count: number): { index: number; description: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<number>();
  const out: { index: number; description: string }[] = [];
  for (const item of value) {
    const index = (item as { index?: unknown })?.index;
    const description = asText((item as { description?: unknown })?.description, LIMITS.description);
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= count || seen.has(index) || !description) continue;
    seen.add(index);
    out.push({ index, description });
  }
  return out.length ? out : undefined;
}

/**
 * Keep only changes the assistant is allowed to make, to entries that exist.
 * Anything else the model sends — a new job title, an index past the end, a
 * changed email — is dropped rather than trusted.
 */
export function sanitizeCvAssistantResult(raw: unknown, cv: AiCvAssistantInput["cv"]): CvAssistantResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { reply?: unknown; changes?: Record<string, unknown> };
  const c = (obj.changes && typeof obj.changes === "object" ? obj.changes : {}) as Record<string, unknown>;
  const changes: CvAssistantChanges = {};

  const summary = asText(c.summary, LIMITS.summary);
  if (summary && summary !== cv.summary.trim()) changes.summary = summary;

  if (Array.isArray(c.skills)) {
    const skills = [...new Set(c.skills.map((s) => asText(s, LIMITS.skill)).filter((s): s is string => Boolean(s)))].slice(0, LIMITS.skills);
    if (skills.length && skills.join("|") !== cv.skills.join("|")) changes.skills = skills;
  }

  const experience = indexed(c.experience, cv.experience.length)?.filter((e) => e.description !== cv.experience[e.index].description.trim());
  if (experience?.length) changes.experience = experience;
  const projects = indexed(c.projects, cv.projects.length)?.filter((p) => p.description !== cv.projects[p.index].description.trim());
  if (projects?.length) changes.projects = projects;

  return { reply: asText(obj.reply, LIMITS.reply) ?? "", changes };
}

export function hasCvChanges(changes: CvAssistantChanges): boolean {
  return Boolean(changes.summary || changes.skills || changes.experience?.length || changes.projects?.length);
}
