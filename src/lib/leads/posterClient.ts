import type { LeadPosterExtraction } from "@/lib/leads/posterExtract";

/** What POST /api/ai/lead-extract answers on success. */
export interface LeadPosterResult extends LeadPosterExtraction {
  /** Sealed reference to the stored poster; null when storage was unavailable. */
  posterToken: string | null;
  posterName: string;
}

/** Why a poster could not be read, as the UI words it. */
export type LeadPosterFailure = "not_poster" | "unreadable" | "too_large" | "bad_type" | "limit" | "failed";

export const LEAD_POSTER_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,.docx";
export const LEAD_POSTER_MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * Send a hiring poster to the reader. Shared by the New Lead popup and the
 * Copilot attach button, so both read posters the same way.
 */
export async function readLeadPoster(
  file: File,
): Promise<{ ok: true; data: LeadPosterResult } | { ok: false; reason: LeadPosterFailure }> {
  if (!ACCEPTED_TYPES.has(file.type)) return { ok: false, reason: "bad_type" };
  if (file.size > LEAD_POSTER_MAX_BYTES) return { ok: false, reason: "too_large" };
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/ai/lead-extract", { method: "POST", body: form });
    if (res.ok) return { ok: true, data: (await res.json()) as LeadPosterResult };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 429) return { ok: false, reason: "limit" };
    if (body.error === "NOT_A_HIRING_POSTER") return { ok: false, reason: "not_poster" };
    if (body.error === "NOT_READABLE") return { ok: false, reason: "unreadable" };
    if (res.status === 400 && /too large/i.test(body.error ?? "")) return { ok: false, reason: "too_large" };
    if (res.status === 400 && /type/i.test(body.error ?? "")) return { ok: false, reason: "bad_type" };
    return { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
