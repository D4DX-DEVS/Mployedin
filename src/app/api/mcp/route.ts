import crypto from "crypto";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { connectDB } from "@/lib/db/mongoose";
import McpToken from "@/models/McpToken";
import { registerMcpTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";

const baseHandler = createMcpHandler(
  async (server) => {
    registerMcpTools(server);
  },
  { serverInfo: { name: "mployedin", version: "1.0.0" } },
  { disableSse: true } // SSE transport is deprecated by the MCP spec — streamable HTTP only
);

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  await connectDB();
  const tokenHash = crypto.createHash("sha256").update(bearerToken).digest("hex");
  const token = await McpToken.findOne({ accessTokenHash: tokenHash, isRevoked: false }).lean();
  if (!token) return undefined;
  if (token.accessTokenExpiresAt.getTime() < Date.now()) return undefined;

  // Best-effort — a failed write here shouldn't fail the actual tool call.
  McpToken.updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});

  return {
    token: bearerToken,
    clientId: token.clientId,
    scopes: token.scopes,
    expiresAt: Math.floor(token.accessTokenExpiresAt.getTime() / 1000),
    extra: { userId: String(token.userId), role: token.role },
  };
}

/**
 * The MCP streamable-HTTP endpoint. Bearer-token authenticated (an access
 * token minted by /api/mcp/token) — see CSRF_EXEMPT_EXACT_PATHS for why this
 * exact path (and only this exact path) skips the cookie-based CSRF check.
 */
const handler = withMcpAuth(baseHandler, verifyToken, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
