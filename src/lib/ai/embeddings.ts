/**
 * Text embedding generation using OpenRouter (Gemini embedding model)
 * Used for vector search across job seeker profiles.
 */

import logger from "@/lib/logger";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const EMBEDDING_MODEL = "google/gemini-embedding-001";

/** Dimensionality of vectors produced by EMBEDDING_MODEL (Atlas index must match). */
export const EMBEDDING_DIMENSIONS = 3072;

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY environment variable is not set");
  return key;
}

/**
 * Generate embedding vector for a text string.
 * Returns a float array (EMBEDDING_DIMENSIONS, currently 3072 for gemini-embedding-001).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmed = text.slice(0, 8000); // Limit input size

  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com",
      "X-Title": "Mployedin",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: trimmed,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error({ status: res.status, err }, "Embedding generation failed");
    throw new Error(`Embedding generation failed: ${res.status}`);
  }

  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a batch.
 * OpenRouter supports batch embedding.
 */
export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const trimmed = texts.map(t => t.slice(0, 8000));

  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com",
      "X-Title": "Mployedin",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: trimmed,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error({ status: res.status, err }, "Batch embedding generation failed");
    throw new Error(`Batch embedding failed: ${res.status}`);
  }

  const data = await res.json() as { data: { embedding: number[]; index: number }[] };
  // Sort by index to maintain order
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Build a searchable text representation of a job seeker profile.
 * Combines all relevant fields into a single text for embedding.
 */
export function buildProfileText(jobSeeker: Record<string, unknown>): string {
  const parts: string[] = [];

  // Name
  const name = (jobSeeker.fullName as string) || (jobSeeker.userId as Record<string, unknown>)?.name as string;
  if (name) parts.push(`Name: ${name}`);

  // Headline & Summary
  if (jobSeeker.headline) parts.push(`Headline: ${jobSeeker.headline}`);
  if (jobSeeker.summary) parts.push(`Summary: ${String(jobSeeker.summary).slice(0, 500)}`);

  // Nationality & Location
  if (jobSeeker.nationality) parts.push(`Nationality: ${jobSeeker.nationality}`);
  if (jobSeeker.currentLocation) parts.push(`Location: ${jobSeeker.currentLocation}`);

  // Skills
  const skills = jobSeeker.skills as string[];
  if (skills?.length) parts.push(`Skills: ${skills.join(", ")}`);

  // Experience
  const experience = jobSeeker.experience as { jobTitle?: string; company?: string; description?: string; isCurrent?: boolean }[];
  if (experience?.length) {
    const expText = experience.map(e => {
      const current = e.isCurrent ? " (current)" : "";
      return `${e.jobTitle} at ${e.company}${current}${e.description ? ` — ${e.description.slice(0, 200)}` : ""}`;
    }).join("; ");
    parts.push(`Experience: ${expText}`);
  }

  // Education
  const education = jobSeeker.education as { degree?: string; field?: string; institution?: string }[];
  if (education?.length) {
    const eduText = education.map(e =>
      `${e.degree}${e.field ? ` in ${e.field}` : ""}${e.institution ? ` from ${e.institution}` : ""}`
    ).join("; ");
    parts.push(`Education: ${eduText}`);
  }

  // Languages
  const languages = jobSeeker.languages as { language?: string; proficiency?: string }[];
  if (languages?.length) {
    parts.push(`Languages: ${languages.map(l => `${l.language} (${l.proficiency})`).join(", ")}`);
  }

  // Certifications
  const certifications = jobSeeker.certifications as string[];
  if (certifications?.length) parts.push(`Certifications: ${certifications.join(", ")}`);

  // Preferences
  if (jobSeeker.preferredJobType) parts.push(`Preferred job type: ${jobSeeker.preferredJobType}`);
  if (jobSeeker.availabilityStatus) parts.push(`Availability: ${String(jobSeeker.availabilityStatus).replace(/_/g, " ")}`);

  const preferredLocations = jobSeeker.preferredLocations as string[];
  if (preferredLocations?.length) parts.push(`Preferred locations: ${preferredLocations.join(", ")}`);

  // Experience years
  if (jobSeeker.totalExperienceYears) parts.push(`Total experience: ${jobSeeker.totalExperienceYears} years`);

  // Industry
  if (jobSeeker.industry) parts.push(`Industry: ${jobSeeker.industry}`);

  // Profile completeness
  if (jobSeeker.profileCompleteness) parts.push(`Profile completeness: ${jobSeeker.profileCompleteness}%`);

  // Status
  if (jobSeeker.status) parts.push(`Status: ${jobSeeker.status}`);

  return parts.join(". ");
}
