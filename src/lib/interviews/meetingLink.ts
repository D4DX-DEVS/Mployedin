/**
 * Built-in meeting-link generation for the in-app calendar (FG-5).
 *
 * The platform owns its interview calendar and does NOT depend on Google
 * Calendar / Google Meet. For video and hybrid interviews we auto-provision a
 * ready-to-use video room using Jitsi Meet — a free, open, no-API-key service
 * that works from any browser. Recruiters can still paste their own link
 * (Zoom, Teams, Whereby, etc.); auto-generation only fills the gap when no
 * link was supplied so every video interview is immediately joinable.
 */

import { randomBytes } from "crypto";

/** Public Jitsi Meet instance — no account or API key required. */
const JITSI_BASE = "https://meet.jit.si";

/** Interview types that require a video room. */
type LinkableType = "video" | "hybrid" | "offline" | string;

/**
 * Build a unique, hard-to-guess room URL. The room name is namespaced with
 * `Mployedin` and a 9-byte random token so rooms are not enumerable.
 */
export function generateMeetingLink(): string {
  const token = randomBytes(9).toString("base64url");
  return `${JITSI_BASE}/Mployedin-${token}`;
}

/**
 * Resolve the meeting link for an interview being created or rescheduled.
 *
 * - Video / hybrid: keep an explicitly provided link, otherwise auto-generate.
 * - Offline: never attach a video link.
 */
export function resolveMeetingLink(type: LinkableType, providedLink?: string | null): string | undefined {
  const trimmed = providedLink?.trim();
  if (type === "offline") return undefined;
  if (trimmed) return trimmed;
  if (type === "video" || type === "hybrid") return generateMeetingLink();
  return undefined;
}
