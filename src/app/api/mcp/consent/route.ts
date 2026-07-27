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

const AUTH_CODE_TTL_SECONDS = 90;

const consentSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(1),
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
  if (!client || !client.redirectUris.includes(body.redirect_uri)) {
    return NextResponse.json({ error: "invalid_request", error_description: "Unknown client_id or redirect_uri" }, { status: 400 });
  }

  if (body.decision === "deny") {
    const url = new URL(body.redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    return NextResponse.json({ redirectTo: url.toString() });
  }

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
    codeChallenge: body.code_challenge,
    scopes: grantedScopes,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
  });

  const url = new URL(body.redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return NextResponse.json({ redirectTo: url.toString() });
}

export const POST = withAuth(postHandler);
