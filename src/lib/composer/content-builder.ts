/**
 * Poster Composer — Content Builder (deterministic)
 * Derives a concise summary + key requirements from real job data.
 * Never invents facts: summary is extracted from the description, requirements
 * come from existing job fields. Per-format limits keep density controlled.
 */

import type { PosterFormat } from "./types";

export interface PosterContentInput {
  description?: string;
  responsibilities?: string[];
  qualifications?: string[];
  skills?: string[];
  requirements?: { skills?: string[]; education?: string } | null;
  experienceMin?: number;
  experienceMax?: number;
}

export interface PosterContent {
  summary: string | null;
  keyRequirements: string[];
}

// Max requirement bullets per format (landscape is too short for a list).
const REQ_LIMIT: Record<PosterFormat, number> = {
  "a4-print": 4,
  "instagram-story": 4,
  "instagram-post": 3,
  "linkedin-post": 0,
};

export function buildPosterContent(job: PosterContentInput | null | undefined, format: PosterFormat): PosterContent {
  if (!job) return { summary: null, keyRequirements: [] };
  return {
    summary: buildSummary(job.description),
    keyRequirements: buildRequirements(job, REQ_LIMIT[format]),
  };
}

/** Strip Markdown so raw syntax (## , **, -, `code`, links) never lands on the poster. */
function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1") // bold/italic
    .replace(/[*_#`>~]/g, "") // stray tokens
    .trim();
}

/** First 1–2 sentences of the real description, capped — no invented text. */
function buildSummary(description?: string): string | null {
  // Drop Markdown heading lines (e.g. "## Responsibilities") so only prose remains.
  // Fallback to all lines if everything was a heading (heading + text on one line);
  // stripMarkdown then removes the inline "#" markers.
  const lines = (description || "").split(/\r?\n/);
  const nonHeading = lines.filter((l) => !/^\s{0,3}#{1,6}\s/.test(l));
  const body = (nonHeading.join(" ").trim() ? nonHeading : lines).join(" ");
  const clean = stripMarkdown(body).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const sentences = clean.match(/[^.!?]+[.!?]?/g) || [clean];
  let out = sentences[0].trim();
  if (out.length < 90 && sentences[1]) out = `${out} ${sentences[1].trim()}`.trim();
  if (out.length > 150) out = `${out.slice(0, 147).trimEnd()}…`;
  return out || null;
}

/** Priority: explicit qualifications → required skills → skills → responsibilities, then experience. */
function buildRequirements(job: PosterContentInput, limit: number): string[] {
  if (limit <= 0) return [];
  const items: string[] = [];
  const add = (arr?: string[]) => {
    for (const raw of arr || []) {
      const t = stripMarkdown(raw).replace(/\s+/g, " ").trim();
      if (t && !items.some((i) => i.toLowerCase() === t.toLowerCase())) items.push(t);
    }
  };
  add(job.qualifications);
  add(job.requirements?.skills);
  add(job.skills);
  add(job.responsibilities);

  const out = items.slice(0, limit).map((s) => (s.length > 60 ? `${s.slice(0, 57).trimEnd()}…` : s));
  if (out.length < limit && job.experienceMin != null) {
    out.push(`${job.experienceMin}-${job.experienceMax || job.experienceMin}+ years experience`);
  }
  return out.slice(0, limit);
}
