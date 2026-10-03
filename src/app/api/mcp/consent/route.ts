import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import McpClient from "@/models/McpClient";
import McpAuthorizationCode from "@/models/McpAuthorizationCode";
import { validateBody } from "@/lib/validators";
import { scopesForRole } from "@/lib/mcp/scopes";
import type { AuthContext } from "@/lib/auth/withAuth";
import { getMcpResourceUrl } from "@/lib/mcp/baseUrl";
import { isAllowedMcpRedirectUri, isValidPkceChallenge } from "@/lib/mcp/oauth";
import { MCP_RATE_LIMITS, mcpRateLimited } from "@/lib/mcp/rateLimit";
import { logActivity } from "@/lib/audit/log";

const AUTH_CODE_TTL_SECONDS = 90;

const consentSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().refine(isValidPkceChallenge, "Invalid PKCE challenge"),
  resource: z.string().url(),
  scope: z.string().optional(),
  state: z.string().optional(),
});

/**
 * POST /api/mcp/consent — the user's Approve/Deny decision on the mcp-authorize
 * consent screen. Ordinary CSRF-protected, session-authenticated route (unlike
 * /register and /token, this is a same-site browser action, not a
 * client-to-server OAuth exchange).
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  const body = await validateBody(req, consentSchema);
  const state = body.state ?? "";

  await connectDB();

  // Re-validate against the DB — never trust client-submitted redirect_uri
  // pairing on its own, even though the user is already authenticated.
  const client = await McpClient.findOne({ clientId: body.client_id }).lean();
  if (!client || !client.redirectUris.includes(body.redirect_uri) || !isAllowedMcpRedirectUri(body.redirect_uri)) {
    return NextResponse.json({ error: "invalid_request", error_description: "Unknown client_id or redirect_uri" }, { status: 400 });
  }
  if (body.resource !== getMcpResourceUrl()) {
    return NextResponse.json(
      { error: "invalid_target", error_description: "resource does not identify this MCP server" },
      { status: 400 },
    );
  }

  if (body.decision === "deny") {
    const url = new URL(body.redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    return NextResponse.json({ redirectTo: url.toString() });
  }

  // An employer's colleague runs on the owner's user id (withAuth swaps it in),
  // so a code minted here would be the OWNER's: no job-access or permission
  // limits, and it would outlive the colleague's removal from the team.
  // Colleagues cannot connect apps until tokens can carry member context.
  if (ctx.member) {
    return NextResponse.json(
      {
        error: "access_denied",
        code: "team_member_not_allowed",
        error_description: "Team member accounts can't connect apps. Ask your account owner.",
      },
      { status: 403 },
    );
  }

  const limited = await mcpRateLimited([[ctx.userId, MCP_RATE_LIMITS.consentPerUser]]);
  if (limited) return limited;

  // Never grant a scope the client requested but the user's role can't hold
  // (e.g. an employer approving still can't end up with job-seeker scopes).
  const grantedScopes = scopesForRole((body.scope ?? "").split(" ").filter(Boolean), ctx.role);

  const code = `mcpac_${crypto.randomBytes(32).toString("hex")}`;
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  await McpAuthorizationCode.create({
    codeHash,
    clientId: body.client_id,
    userId: ctx.userId,
    role: ctx.role,
    redirectUri: body.redirect_uri,
    resource: body.resource,
    codeChallenge: body.code_challenge,
    scopes: grantedScopes,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
  });

  await logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "mcp.connected",
    resource: "auth",
    meta: { clientId: client.clientId, clientName: client.clientName, scopes: grantedScopes },
    req,
  });

  const url = new URL(body.redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return NextResponse.json({ redirectTo: url.toString() });
}

// skipTenantView: an admin or agent viewing an employer's workspace (or an admin
// impersonating one) runs as that employer inside withAuth. Without this, their
// approval would mint a 90-day token in the EMPLOYER's name that outlives the
// tenant-view session and any later reassignment. Consent is always the actor's own.
export const POST = withAuth(postHandler, { skipTenantView: true });
