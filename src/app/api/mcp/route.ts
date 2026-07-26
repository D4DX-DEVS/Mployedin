import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerMcpTools } from "@/lib/mcp/tools";
import { verifyMcpToken } from "@/lib/mcp/verifyToken";

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
const handler = withMcpAuth(baseHandler, verifyMcpToken, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
