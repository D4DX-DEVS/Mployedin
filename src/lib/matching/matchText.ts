/**
 * The text each seeker and each job is embedded from for vector retrieval.
 *
 * Both sides use the same labels ("Skills:", "Years of experience:") and lead
 * with the role, so a seeker's vector and a job's vector are built from
 * comparable text. The hash covers the text, the embedding model and its size:
 * when any of them changes, the stored vector is stale and gets re-embedded.
 */
import { createHash } from "node:crypto";
import { effectiveJobSkills } from "@/lib/matching/jobSkillExtraction";
import { MATCH_EMBEDDING_DIMS, matchEmbeddingModel } from "@/lib/ai/openRouterEmbeddings";

/** Characters embedded per document; the description comes last and is cut first. */
export const MATCH_TEXT_MAX = 2000;

/** Every JobSeeker path seekerMatchText reads. */
export const SEEKER_MATCH_TEXT_FIELDS =
  "preferredRoles careerProfile.jobRole headline skills experience totalExperienceYears industry certifications summary";

/** Every Job path jobMatchText reads. */
export const JOB_MATCH_TEXT_FIELDS =
  "title category description requirements.skills requirements.preferredSkills requirements.aiSkills " +
  "requirements.aiPreferredSkills requirements.experienceMin requirements.experienceMax";

export interface MatchText {
  text: string;
  hash: string;
}

export interface SeekerTextSource {
  preferredRoles?: string[] | null;
  careerProfile?: { jobRole?: string | null } | null;
  headline?: string | null;
  skills?: string[] | null;
  experience?: Array<{ jobTitle?: string | null; company?: string | null }> | null;
  totalExperienceYears?: number | null;
  industry?: string | null;
  certifications?: string[] | null;
  summary?: string | null;
}

export interface JobTextSource {
  title?: string | null;
  category?: string | null;
  description?: string | null;
  requirements?: {
    skills?: string[];
    preferredSkills?: string[];
    aiSkills?: string[];
    aiPreferredSkills?: string[];
    experienceMin?: number;
    experienceMax?: number;
  } | null;
}

const plain = (v: unknown): string =>
  typeof v === "string" ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";

const list = (v: unknown, max = 40): string[] =>
  Array.isArray(v) ? v.map(plain).filter(Boolean).slice(0, max) : [];

function finish(lines: Array<string | false | null | undefined>): MatchText {
  const text = lines.filter(Boolean).join("\n").slice(0, MATCH_TEXT_MAX);
  const hash = createHash("sha256")
    .update(`${matchEmbeddingModel()}|${MATCH_EMBEDDING_DIMS}|${text}`)
    .digest("hex")
    .slice(0, 32);
  return { text, hash };
}

export function seekerMatchText(doc: SeekerTextSource): MatchText {
  const roles = list(doc.preferredRoles);
  const role = roles.length > 0 ? roles.join(", ") : plain(doc.careerProfile?.jobRole);
  const skills = list(doc.skills);
  const roleLines = (doc.experience ?? [])
    .slice(0, 5)
    .map((e) => [plain(e?.jobTitle), plain(e?.company)].filter(Boolean).join(" at "))
    .filter(Boolean);
  const certifications = list(doc.certifications, 10);
  const years = doc.totalExperienceYears ?? 0;
  return finish([
    role && `Target role: ${role}`,
    plain(doc.headline) && `Headline: ${plain(doc.headline)}`,
    skills.length > 0 && `Skills: ${skills.join(", ")}`,
    roleLines.length > 0 && `Experience: ${roleLines.join("; ")}`,
    years > 0 && `Years of experience: ${years}`,
    plain(doc.industry) && `Industry: ${plain(doc.industry)}`,
    certifications.length > 0 && `Certifications: ${certifications.join(", ")}`,
    plain(doc.summary) && `Summary: ${plain(doc.summary)}`,
  ]);
}

export function jobMatchText(doc: JobTextSource): MatchText {
  const { skills, preferredSkills } = effectiveJobSkills({ requirements: doc.requirements ?? undefined });
  const min = doc.requirements?.experienceMin ?? 0;
  const max = doc.requirements?.experienceMax ?? 30;
  // The schema defaults are 0 and 30: a range at the defaults says nothing.
  const experience = min > 0 || max < 30 ? `${min}${max < 30 ? `-${max}` : "+"}` : "";
  return finish([
    plain(doc.title) && `Role: ${plain(doc.title)}`,
    plain(doc.category) && `Category: ${plain(doc.category)}`,
    skills.length > 0 && `Skills: ${list(skills).join(", ")}`,
    preferredSkills.length > 0 && `Preferred skills: ${list(preferredSkills).join(", ")}`,
    experience && `Years of experience: ${experience}`,
    plain(doc.description) && `Description: ${plain(doc.description)}`,
  ]);
}
