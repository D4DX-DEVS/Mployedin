import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import McpToken from "@/models/McpToken";
import McpClient from "@/models/McpClient";
import { mcpGrantedAt } from "@/lib/mcp/oauth";
import { connectedAppsOwnerId, type ConnectedApp } from "@/lib/mcp/connectedApps";

/**
 * GET /api/user/connected-apps — AI apps (ChatGPT, Claude, …) the user has
 * approved through the MCP consent screen and that can still read their data.
 * One entry per grant: refresh rotates tokens inside a family, and only the
 * newest token of a live family is unrevoked.
 */
async function getHandler(_req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const tokens = await McpToken.find({
    userId: connectedAppsOwnerId(ctx),
    isRevoked: false,
    authorizationExpiresAt: { $gt: new Date() },
  })
    .select("familyId clientId scopes lastUsedAt createdAt authorizationExpiresAt")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const clientIds = [...new Set(tokens.map((token) => token.clientId))];
  const clients = await McpClient.find({ clientId: { $in: clientIds } })
    .select("clientId clientName")
    .lean();
  const nameById = new Map(clients.map((client) => [client.clientId, client.clientName]));

  const seen = new Set<string>();
  const apps: ConnectedApp[] = [];
  for (const token of tokens) {
    if (seen.has(token.familyId)) continue;
    seen.add(token.familyId);
    apps.push({
      id: token.familyId,
      clientName: nameById.get(token.clientId) ?? "Unknown app",
      scopes: token.scopes,
      connectedAt: mcpGrantedAt(token.authorizationExpiresAt).toISOString(),
      // A refresh mints a fresh token, and refreshing is itself use.
      lastUsedAt: (token.lastUsedAt ?? token.createdAt).toISOString(),
      expiresAt: token.authorizationExpiresAt.toISOString(),
    });
  }

  return NextResponse.json({ apps });
}

export const GET = withAuth(getHandler, { skipTenantView: true });
