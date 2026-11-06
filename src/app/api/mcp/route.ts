import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { SUPPORTED_PROTOCOL_VERSIONS, type Implementation } from "@modelcontextprotocol/sdk/types.js";
import { registerMcpTools } from "@/lib/mcp/tools";
import { verifyMcpToken } from "@/lib/mcp/verifyToken";
import { MCP_RATE_LIMITS, mcpRateLimited, tokenKey } from "@/lib/mcp/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { getAppBaseUrl } from "@/lib/mcp/baseUrl";

export const runtime = "nodejs";

/**
 * title + icons (MCP 2025-11-25) are what Claude, ChatGPT and Codex can show
 * beside the connector; without them they fall back to a letter or "@".
 */
const SERVER_INFO: Implementation = {
  name: "mployedin",
  title: "Mployedin",
  version: "1.0.0",
  websiteUrl: getAppBaseUrl(),
  icons: [
    { src: `${getAppBaseUrl()}/icons/icon-192x192.png`, mimeType: "image/png", sizes: ["192x192"] },
    { src: `${getAppBaseUrl()}/icons/icon-512x512.png`, mimeType: "image/png", sizes: ["512x512"] },
  ],
};

const baseHandler = createMcpHandler(
  async (server) => {
    registerMcpTools(server);
  },
  // mcp-handler types serverInfo as { name, version } but hands it unchanged
  // to the SDK's McpServer, which sends the full Implementation.
  { serverInfo: SERVER_INFO as { name: string; version: string } },
  {
    // mcp-handler serves only `${basePath}/mcp` and answers every other path
    // with a bare 404. Without basePath it expects "/mcp", so every signed-in
    // request to this route (/api/mcp) got "Not found" once auth had passed.
    basePath: "/api",
    disableSse: true, // SSE transport is deprecated by the MCP spec — streamable HTTP only
  }
);

/**
 * The MCP streamable-HTTP endpoint. Bearer-token authenticated (an access
 * token minted by /api/mcp/token) — see CSRF_EXEMPT_EXACT_PATHS for why this
 * exact path (and only this exact path) skips the cookie-based CSRF check.
 */
const authedHandler = withMcpAuth(baseHandler, verifyMcpToken, {
  required: true,
  // RFC 9728 §3.1 path-suffixed metadata URL for the /api/mcp resource; the
  // proxy rewrites it (and the bare root form) to the same metadata route.
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

/**
 * This server speaks the legacy (initialize-handshake) MCP versions, up to
 * 2025-11-25. A 2026-07-28 ("modern") client opens with a request declaring its
 * own version — usually a `server/discover` probe — and falls back to
 * `initialize` only if the answer reads as a legacy server. The SDK's own
 * rejection (400 + JSON-RPC -32000) made MCP Inspector 2.x give up instead:
 * through its web proxy every HTTP 4xx surfaces as a fatal "Version
 * negotiation probe failed".
 *
 * So answer the way a legacy server answers an unknown method — HTTP 200 with
 * JSON-RPC -32601 — for the discover probe, which every dual-era client
 * (Inspector included) treats as "legacy, fall back". Any other request with
 * an unsupported version gets an empty 400, the 2026-07-28 Streamable HTTP
 * spec's own fallback signal ("If the body is empty … fall back to initialize").
 */
async function legacyFallbackResponse(req: Request): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const version = req.headers.get("mcp-protocol-version");
  if (version === null || SUPPORTED_PROTOCOL_VERSIONS.includes(version)) return null;

  const body = (await req.clone().json().catch(() => null)) as { id?: unknown; method?: unknown } | null;
  if (body?.method === "server/discover" && (typeof body.id === "string" || typeof body.id === "number")) {
    return Response.json(
      { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
}

/** Rate-limited before the token is looked up, so a flood never reaches the database. */
async function handler(req: Request): Promise<Response> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const limited = await mcpRateLimited([
    [getClientIp(req.headers), MCP_RATE_LIMITS.toolCallsPerIp] as const,
    ...(bearer ? [[tokenKey(bearer), MCP_RATE_LIMITS.toolCallsPerToken] as const] : []),
  ]);
  if (limited) return limited;
  const fallback = await legacyFallbackResponse(req);
  if (fallback) return fallback;
  return authedHandler(req);
}

export { handler as GET, handler as POST, handler as DELETE };
