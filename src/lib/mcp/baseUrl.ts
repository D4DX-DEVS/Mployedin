/** Same env-var fallback chain used by every other route that needs the app's public origin. */
export function getAppBaseUrl(): string {
  const configured =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return new URL(configured).origin;
}

/** Path of the MCP endpoint itself (the streamable-HTTP route). */
export const MCP_ENDPOINT_PATH = "/api/mcp";

/**
 * Canonical OAuth resource identifier (RFC 8707 / RFC 9728): the MCP server's
 * own URL. The MCP spec and ChatGPT both treat the connector URL the user
 * pastes (`https://<host>/api/mcp`) as the resource, so that is what the
 * protected-resource metadata advertises and what new grants are bound to.
 */
export function getMcpResourceUrl(): string {
  return `${getAppBaseUrl()}${MCP_ENDPOINT_PATH}`;
}

/** Protected-resource metadata URL for the canonical resource (RFC 9728 §3.1 path-suffixed form). */
export function getMcpResourceMetadataUrl(): string {
  return `${getAppBaseUrl()}/.well-known/oauth-protected-resource${MCP_ENDPOINT_PATH}`;
}

/**
 * Maps a client-supplied `resource` to the canonical identifier, or null when
 * it names some other server. Accepted spellings:
 * - the MCP endpoint URL, with or without a trailing slash (ChatGPT, MCP SDK);
 * - the bare origin, with or without a trailing slash: what this server
 *   advertised before 2026-11-06, so grants and tokens issued then still work.
 * An absent resource (empty string) is NOT handled here; RFC 8707 makes the
 * parameter optional, and each endpoint decides what absence means.
 */
export function normalizeMcpResource(resource: string): string | null {
  const origin = getAppBaseUrl();
  const accepted = new Set([
    origin,
    `${origin}/`,
    `${origin}${MCP_ENDPOINT_PATH}`,
    `${origin}${MCP_ENDPOINT_PATH}/`,
  ]);
  return accepted.has(resource) ? getMcpResourceUrl() : null;
}

/** True when `resource` (e.g. one stored on an old token) identifies this MCP server. */
export function isMcpResource(resource: string | null | undefined): boolean {
  return typeof resource === "string" && normalizeMcpResource(resource) !== null;
}
