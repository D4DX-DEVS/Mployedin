import type { JobFormValues } from "./jobFormSchema";

/**
 * How long a local draft stays offerable.
 *
 * A draft older than this is almost never the job the employer came back to
 * finish — it is stale content from a session they have forgotten, and
 * restoring it silently handed them a half-filled form that looked fresh.
 */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** A locally stored draft plus when it was written. */
export interface StoredDraft {
  values: JobFormValues;
  savedAt: number;
}

/**
 * Reads a stored draft, discarding anything past DRAFT_MAX_AGE_MS. Kept free of
 * React and browser globals so the expiry rule is testable on its own.
 */
export function parseStoredDraft(raw: string | null, now: number = Date.now()): StoredDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { values?: JobFormValues; savedAt?: number };
    if (!parsed.values) return null;
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (!savedAt || now - savedAt > DRAFT_MAX_AGE_MS) return null;
    return { values: parsed.values, savedAt };
  } catch {
    return null;
  }
}
