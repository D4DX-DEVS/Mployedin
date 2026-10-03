import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerMcpTools } from "@/lib/mcp/tools";
import { verifyMcpToken } from "@/lib/mcp/verifyToken";
import { MCP_RATE_LIMITS, mcpRateLimited, tokenKey } from "@/lib/mcp/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

export const runtime = "nodejs";

const baseHandler = createMcpHandler(
  async (server) => {
    registerMcpTools(server);
  },
  { serverInfo: { name: "mployedin", version: "1.0.0" } },
  { disableSse: true } // SSE transport is deprecated by the MCP spec — streamable HTTP only
);

/**
 * The MCP streamable-HTTP endpoint. Bearer-token authenticated (an access
 * token minted by /api/mcp/token) — see CSRF_EXEMPT_EXACT_PATHS for why this
 * exact path (and only this exact path) skips the cookie-based CSRF check.
 */
const authedHandler = withMcpAuth(baseHandler, verifyMcpToken, { required: true });

/** Rate-limited before the token is looked up, so a flood never reaches the database. */
async function handler(req: Request): Promise<Response> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const limited = await mcpRateLimited([
    [getClientIp(req.headers), MCP_RATE_LIMITS.toolCallsPerIp] as const,
    ...(bearer ? [[tokenKey(bearer), MCP_RATE_LIMITS.toolCallsPerToken] as const] : []),
  ]);
  if (limited) return limited;
  return authedHandler(req);
}

export { handler as GET, handler as POST, handler as DELETE };
