/**
 * The one home of the rules for fetching a Google or LinkedIn profile photo on
 * our server: which hosts count, how a host is matched, how big a photo may be,
 * and how a body is read without trusting the sender's Content-Length.
 *
 * Plain ESM with no imports, on purpose. Three places use it and one of them is
 * not part of the Next build:
 *   - src/lib/images/externalAvatar.ts   (rewrites a photo URL to our proxy)
 *   - src/app/api/proxy-image/route.ts   (the proxy that fetches the photo)
 *   - scripts/rehost-provider-avatars.mjs, through scripts/lib/rehostProviderAvatarsCore.mjs,
 *     which Node runs directly and which cannot resolve the app's path alias.
 * A second copy of any of this is a second place to forget a fix, so there is none.
 */

/**
 * Hosts that serve a provider avatar. A real subdomain (dot boundary) also counts.
 * @type {readonly string[]}
 */
export const PROVIDER_AVATAR_HOSTS = ["lh3.googleusercontent.com", "media.licdn.com"];

/** Largest photo the proxy relays and the script copies: 5 MB. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * The one host matcher: the host itself or a real subdomain of one of `allowed`
 * (dot boundary), case-insensitively, never a plain suffix match: "evilmedia.licdn.com"
 * and "media.licdn.com.evil.com" do not match "media.licdn.com".
 *
 * @param {string} hostname
 * @param {readonly string[]} allowed
 * @returns {boolean}
 */
export function matchesHostOrSubdomain(hostname, allowed) {
  const host = hostname.toLowerCase();
  if (!host) return false;
  return allowed.some((name) => host === name || host.endsWith(`.${name}`));
}

/**
 * Exact host or a real subdomain, never a suffix match: "evilmedia.licdn.com"
 * and "media.licdn.com.evil.com" are not provider hosts.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
export function isProviderAvatarHost(hostname) {
  return matchesHostOrSubdomain(hostname, PROVIDER_AVATAR_HOSTS);
}

/**
 * Read at most `maxBytes` of a response body. A declared Content-Length over the
 * cap is refused before any byte is read; a body that outgrows its header (or has
 * none) is cut off and the stream cancelled. Returns null when over the cap.
 *
 * @param {Response} response
 * @param {number} [maxBytes]
 * @returns {Promise<Uint8Array | null>}
 */
export async function readCapped(response, maxBytes = MAX_AVATAR_BYTES) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
