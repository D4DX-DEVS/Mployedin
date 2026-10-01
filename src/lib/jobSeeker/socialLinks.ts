/**
 * Profile links in the shape the job-seeker profile save accepts
 * (`socialLinks` in lib/validators/job-seekers.ts). The CV reader and older
 * imports stored whatever text sat under a link — `{ label: "LinkedIn", url:
 * "LinkedIn" }` — and one such entry made every later profile save fail.
 */

export interface ProfileLink {
  label: string;
  url: string;
}

const MAX_URL_LENGTH = 2048;
const MAX_LABEL_LENGTH = 50;

/** An http(s) address for a typed or stored link, or null when it isn't one. Bare domains get https://. */
export function toLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`);
  } catch {
    return null;
  }
  // "LinkedIn" parses as https://linkedin/ — a real site has a dotted host.
  if (!url.hostname.includes(".") || url.href.length > MAX_URL_LENGTH) return null;
  return url.href;
}

/**
 * The canonical https://www.linkedin.com/in/<name> for any spelling of a
 * LinkedIn profile address (in.linkedin.com, no scheme, tracking query), or
 * null when it isn't a profile. The canonical form is the only one the
 * profile accepts under a "LinkedIn" label.
 */
export function toLinkedInProfileUrl(raw: unknown): string | null {
  const href = toLinkUrl(raw);
  if (!href) return null;
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const profile = /^\/in\/([^/]+)\/?$/.exec(url.pathname);
  return profile ? `https://www.linkedin.com/in/${profile[1]}` : null;
}

/** The address to save for a link under this label — a "LinkedIn" label must hold a profile. */
export function toProfileLinkUrl(label: string, raw: unknown): string | null {
  return label.trim().toLowerCase() === "linkedin" ? toLinkedInProfileUrl(raw) : toLinkUrl(raw);
}

/** Keep only links that are real addresses, in the form the profile accepts, once each. */
export function cleanSocialLinks(links: unknown): ProfileLink[] {
  if (!Array.isArray(links)) return [];
  const cleaned: ProfileLink[] = [];
  for (const link of links) {
    if (typeof link !== "object" || link === null) continue;
    const { label: rawLabel, url: rawUrl } = link as { label?: unknown; url?: unknown };
    const label = (typeof rawLabel === "string" ? rawLabel.trim() : "").slice(0, MAX_LABEL_LENGTH) || "Link";
    const url = toProfileLinkUrl(label, rawUrl);
    if (url && !cleaned.some((l) => l.url === url)) cleaned.push({ label, url });
  }
  return cleaned;
}
