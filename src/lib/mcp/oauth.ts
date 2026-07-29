const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

/** OAuth redirect URIs must be HTTPS, except exact loopback hosts in local development. */
export function isAllowedMcpRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** S256 always produces a 32-byte base64url value (43 characters, no padding). */
export function isValidPkceChallenge(value: string): boolean {
  return PKCE_CHALLENGE_RE.test(value);
}

export function isValidPkceVerifier(value: string): boolean {
  return PKCE_VERIFIER_RE.test(value);
}
