/** A user's grant to an app lasts at most this long; refresh never extends it. */
export const MCP_AUTHORIZATION_TTL_SECONDS = 60 * 60 * 24 * 90;

/**
 * When the user approved this grant, derived from its fixed expiry. Tokens are
 * re-minted on every refresh, so a token's own createdAt is not the grant time.
 */
export function mcpGrantedAt(authorizationExpiresAt: Date): Date {
  return new Date(authorizationExpiresAt.getTime() - MCP_AUTHORIZATION_TTL_SECONDS * 1000);
}

/**
 * A password change or reset ends every web session (auth config compares it to
 * the JWT's iat). Grants approved before it must end too, or a stolen grant
 * outlives the very reset meant to lock the thief out.
 */
export function grantPredatesPasswordChange(
  authorizationExpiresAt: Date,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!passwordChangedAt) return false;
  return mcpGrantedAt(authorizationExpiresAt).getTime() < new Date(passwordChangedAt).getTime();
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

/**
 * HTTPS hosts an approval code may be sent back to. Registration is open
 * (RFC 7591), so without this anyone could register a client named "ChatGPT"
 * whose redirect is their own site, send a user the authorize link, and collect
 * a working grant once the user clicks Allow. MCP_EXTRA_REDIRECT_HOSTS
 * (comma-separated hostnames) adds more clients without a code change.
 */
const DEFAULT_REDIRECT_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "claude.com"];

function allowedRedirectHosts(): Set<string> {
  const extra = (process.env.MCP_EXTRA_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_REDIRECT_HOSTS, ...extra]);
}

/**
 * Redirect URIs must go to a known AI client over HTTPS, or to an exact loopback
 * host (local tools such as MCP Inspector) over HTTP or HTTPS.
 */
export function isAllowedMcpRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (LOOPBACK_HOSTS.has(url.hostname)) return url.protocol === "http:" || url.protocol === "https:";
    return url.protocol === "https:" && allowedRedirectHosts().has(url.hostname);
  } catch {
    return false;
  }
}

/** The host:port the consent screen tells the user they will return to. */
export function mcpRedirectHost(redirectUri: string): string | null {
  try {
    return new URL(redirectUri).host;
  } catch {
    return null;
  }
}

/** S256 always produces a 32-byte base64url value (43 characters, no padding). */
export function isValidPkceChallenge(value: string): boolean {
  return PKCE_CHALLENGE_RE.test(value);
}

export function isValidPkceVerifier(value: string): boolean {
  return PKCE_VERIFIER_RE.test(value);
}
