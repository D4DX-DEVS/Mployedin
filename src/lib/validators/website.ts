import { z } from "zod";

/**
 * Company websites are typed by hand, and people type them the way they say
 * them: "www.talindia.co", "talindia.co". A bare z.string().url() rejects both
 * because neither carries a scheme, so employer registration dead-ended on an
 * *optional* field. Normalise first, validate what we normalised, and store
 * that — so the value we keep is always a real absolute URL.
 */

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
// A hostname a company could actually own: labels separated by dots, with a
// letters-only TLD. Catches "talindia" and "http://" typos without needing a
// public-suffix list.
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const WEBSITE_MAX_LENGTH = 2048;

/**
 * Turns user input into a canonical https URL, or reports that it is not a
 * website at all. An empty input is valid and normalises to "" — the field is
 * optional and plenty of small employers have no site.
 */
export function normalizeWebsiteUrl(raw: string | null | undefined): { ok: true; value: string } | { ok: false } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: "" };
  if (trimmed.length > WEBSITE_MAX_LENGTH) return { ok: false };

  // "www.talindia.co" and "talindia.co" are websites; "javascript:alert(1)" and
  // "ftp://host" are not things we will ever render as a company link.
  const candidate = SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false };
  if (url.username || url.password) return { ok: false };
  if (!HOSTNAME_RE.test(url.hostname)) return { ok: false };

  const value = url.toString();
  if (value.length > WEBSITE_MAX_LENGTH) return { ok: false };
  return { ok: true, value };
}

/** True when the input is blank or a website we can store. */
export function isValidWebsiteInput(raw: string | null | undefined): boolean {
  return normalizeWebsiteUrl(raw).ok;
}

/**
 * Field schema for a company website. Use this rather than commonSchemas.url:
 * z.string().url() is wrong in both directions here — it rejects the
 * scheme-less "www.talindia.co" people type, and it *accepts*
 * "javascript:alert(1)", which the public company page renders straight into
 * an href. Blank stays blank; anything valid is stored normalised.
 */
export const websiteSchema = z
  .string()
  .max(WEBSITE_MAX_LENGTH)
  .transform((v, ctx) => {
    const result = normalizeWebsiteUrl(v);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a website like yourcompany.com, or leave it blank.",
      });
      return z.NEVER;
    }
    return result.value;
  });
