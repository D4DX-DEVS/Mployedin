import crypto from "crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { connectDB } from "@/lib/db/mongoose";
import McpToken from "@/models/McpToken";
import User from "@/models/User";
import { getMcpResourceUrl } from "@/lib/mcp/baseUrl";
import { defaultScopesForRole, type McpScope } from "@/lib/mcp/scopes";

export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  await connectDB();
  const tokenHash = crypto.createHash("sha256").update(bearerToken).digest("hex");
  const token = await McpToken.findOne({ accessTokenHash: tokenHash, isRevoked: false }).lean();
  if (!token) return undefined;
  if (token.accessTokenExpiresAt.getTime() < Date.now()) return undefined;
  if (!token.authorizationExpiresAt || token.authorizationExpiresAt.getTime() < Date.now()) return undefined;
  if (token.resource !== getMcpResourceUrl()) return undefined;

  // Authorization is live, not a 90-day snapshot. Deactivation, role changes,
  // and custom permission changes take effect on the very next tool call.
  const user = await User.findById(token.userId)
    .select("role isActive permissionMode customPermissions")
    .lean();
  if (!user?.isActive || user.role !== token.role) {
    McpToken.updateMany({ userId: token.userId }, { $set: { isRevoked: true } }).catch(() => {});
    return undefined;
  }

  const allowedScopes = new Set(defaultScopesForRole(user.role));
  const scopes = token.scopes.filter((scope: string): scope is McpScope =>
    allowedScopes.has(scope as McpScope)
  );
  if (scopes.length === 0) return undefined;

  // Best-effort — a failed write here shouldn't fail the actual tool call.
  McpToken.updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});

  return {
    token: bearerToken,
    clientId: token.clientId,
    scopes,
    expiresAt: Math.floor(token.accessTokenExpiresAt.getTime() / 1000),
    extra: {
      userId: String(token.userId),
      role: user.role,
      permissionMode: user.permissionMode,
      customPermissions: user.customPermissions,
    },
  };
}
