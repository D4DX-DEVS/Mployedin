/**
 * Profile photos that came from Google or LinkedIn sign-in are stored as the
 * provider's own URL. Loaded straight from that URL they send the visitor's IP
 * address and browser details to Google or LinkedIn on every page view, so the
 * browser asks our server instead (/api/proxy-image) and our server fetches.
 *
 * The host list and the host matcher live in providerAvatarHosts.mjs, the one
 * copy shared with the proxy route and the re-host script; they are re-exported
 * here so a render site has a single import.
 */

import { PROVIDER_AVATAR_HOSTS, isProviderAvatarHost, matchesHostOrSubdomain } from "./providerAvatarHosts.mjs";

export { PROVIDER_AVATAR_HOSTS, isProviderAvatarHost };

/** Same-origin path the browser loads a provider avatar from. */
export const AVATAR_PROXY_PATH = "/api/proxy-image";

/**
 * The address a browser should load for an image URL that may be a provider
 * avatar: our own proxy for a Google or LinkedIn https URL, the input unchanged
 * for everything else (our storage, relative paths, data: and blob: URLs, any
 * other host), undefined for nothing.
 */
export function toSafeImageSrc(src: string | null | undefined): string | undefined {
  const value = src?.trim();
  if (!value) return undefined;

  // "//host/path" is a remote https URL in a browser's eyes, not a relative path.
  const absolute = value.startsWith("//") ? `https:${value}` : value;
  if (!/^https:\/\//i.test(absolute)) return value;

  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return value;
  }
  if (!isProviderAvatarHost(parsed.hostname)) return value;

  return `${AVATAR_PROXY_PATH}?url=${encodeURIComponent(absolute)}`;
}

/**
 * Our own storage: DigitalOcean Spaces and its CDN (the CSP img-src lists them). Cloudinary is not here:
 * res.cloudinary.com is one host shared by every Cloudinary account, so allowing it would let any
 * account's images through, and Spaces replaced it (lib/storage/spaces.ts).
 */
const OWN_STORAGE_SUFFIX = "digitaloceanspaces.com";

/**
 * The configured bucket or CDN host, when the deployment names it. Must be a NEXT_PUBLIC_ variable: the
 * server and the browser both run this check while rendering, and a value only the server can see would
 * make them disagree (a hydration mismatch). When unset, any Spaces host is accepted, as /api/image-proxy
 * does without SPACES_PUBLIC_HOST.
 */
function pinnedStorageHost(): string | undefined {
  const pinned = process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST?.trim().toLowerCase();
  return pinned || undefined;
}

function isOwnStorageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const pinned = pinnedStorageHost();
  if (pinned) return host === pinned;
  // Any bucket on Spaces (a real subdomain: "digitaloceanspaces.com.evil.com" is not one).
  return host !== OWN_STORAGE_SUFFIX && matchesHostOrSubdomain(host, [OWN_STORAGE_SUFFIX]);
}

/** Characters a browser strips or reads as a slash inside a URL: control characters (tab, CR, LF...) and backslash. */
const UNSAFE_IN_URL = /[\u0000-\u001f\u007f\\]/;
const SAME_ORIGIN = "https://same-origin.invalid";

/**
 * The address a PUBLIC page may let the browser load for an image whose URL came
 * from the CMS or a user. A browser that loads a third-party image sends the
 * visitor's IP address and browser details to that host before any cookie choice
 * (and after "Reject all"), so only these are returned:
 *   - same-origin paths (checked by resolving them, not by the absence of a
 *     scheme: "/\host", "\\host" and "/<TAB>/host" are protocol-relative URLs
 *     to a browser), data:image and blob: URLs, unchanged;
 *   - Google and LinkedIn photos, through our proxy (our server fetches);
 *   - our own storage (Spaces and its CDN) over https, unchanged;
 * and undefined for everything else (the caller shows its initials or placeholder).
 *
 * There is deliberately no proxy for arbitrary hosts: that would be an open
 * relay (SSRF). Hosts that should show must be added above, to the CSP and to
 * next.config images.remotePatterns together.
 */
export function toPublicImageSrc(src: string | null | undefined): string | undefined {
  const value = src?.trim();
  if (!value) return undefined;
  if (UNSAFE_IN_URL.test(value)) return undefined;

  const absolute = value.startsWith("//") ? `https:${value}` : value;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(absolute)) {
    // No scheme: a relative path, but only if it really stays on our own origin.
    try {
      return new URL(value, SAME_ORIGIN + "/").origin === SAME_ORIGIN ? value : undefined;
    } catch {
      return undefined;
    }
  }
  if (/^blob:/i.test(absolute) || /^data:image\//i.test(absolute)) return value;
  if (!/^https:\/\//i.test(absolute)) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    return undefined;
  }
  if (parsed.username || parsed.password || parsed.port) return undefined;
  if (isProviderAvatarHost(parsed.hostname)) return `${AVATAR_PROXY_PATH}?url=${encodeURIComponent(absolute)}`;
  if (isOwnStorageHost(parsed.hostname)) return value;
  return undefined;
}
