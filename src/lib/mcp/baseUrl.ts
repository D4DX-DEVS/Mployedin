/** Same env-var fallback chain used by every other route that needs the app's public origin. */
export function getAppBaseUrl(): string {
  const configured =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return new URL(configured).origin;
}

/**
 * Canonical OAuth resource identifier advertised by the protected-resource
 * metadata endpoint. The MCP endpoint belongs to this origin, and every
 * authorization code/token is bound to this exact value.
 */
export function getMcpResourceUrl(): string {
  return getAppBaseUrl();
}
