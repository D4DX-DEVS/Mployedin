import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import McpClient from "@/models/McpClient";
import { getAppBaseUrl, getMcpResourceUrl } from "@/lib/mcp/baseUrl";
import { isValidPkceChallenge } from "@/lib/mcp/oauth";

const DEFAULT_LOCALE = "en";

function authorizeError(redirectUri: string, error: string, description: string, state: string | null) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}

/**
 * GET /api/mcp/authorize — OAuth 2.1 authorization endpoint.
 * Reuses the existing NextAuth session for login: if the caller isn't signed
 * in, they're bounced to the normal /login page (with a callback straight
 * back here) instead of mployedin building a second, parallel login form.
 * On success, hands off to the consent page — the actual authorization code
 * is only minted after the user approves there.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("client_id") ?? "";
  const redirectUri = sp.get("redirect_uri") ?? "";
  const responseType = sp.get("response_type") ?? "";
  const codeChallenge = sp.get("code_challenge") ?? "";
  const codeChallengeMethod = sp.get("code_challenge_method") ?? "";
  const resource = sp.get("resource") ?? "";
  const scope = sp.get("scope") ?? "";
  const state = sp.get("state");

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "invalid_request", error_description: "client_id and redirect_uri are required" }, { status: 400 });
  }

  await connectDB();
  const client = await McpClient.findOne({ clientId }).lean();
  if (!client || !client.redirectUris.includes(redirectUri)) {
    // Do NOT redirect on an unrecognized client/redirect_uri — that would turn
    // this endpoint into an open redirector.
    return NextResponse.json({ error: "invalid_request", error_description: "Unknown client_id or redirect_uri" }, { status: 400 });
  }

  if (responseType !== "code") {
    return authorizeError(redirectUri, "unsupported_response_type", "Only response_type=code is supported", state);
  }
  if (!isValidPkceChallenge(codeChallenge) || codeChallengeMethod !== "S256") {
    return authorizeError(redirectUri, "invalid_request", "PKCE (code_challenge with S256) is required", state);
  }
  if (resource !== getMcpResourceUrl()) {
    return authorizeError(redirectUri, "invalid_target", "resource does not identify this MCP server", state);
  }

  const session = await auth();

  if (!session?.user) {
    const loginUrl = new URL(`/${DEFAULT_LOCALE}/login`, getAppBaseUrl());
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  if ((session.user as unknown as { pending2fa?: boolean }).pending2fa) {
    const verifyUrl = new URL(`/${DEFAULT_LOCALE}/verify-oauth-2fa`, getAppBaseUrl());
    verifyUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(verifyUrl);
  }

  // Fully authenticated — hand off to the consent screen. The params are the
  // same ones a browser already carries in the URL bar for any OAuth
  // provider's own /authorize screen (Google, GitHub, ...) — none of them are
  // secret, so passing them through as query params (rather than a signed
  // server-side stash) adds no risk and no extra round trip.
  const consentUrl = new URL(`/${DEFAULT_LOCALE}/mcp-authorize`, getAppBaseUrl());
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("code_challenge", codeChallenge);
  consentUrl.searchParams.set("resource", resource);
  consentUrl.searchParams.set("scope", scope);
  if (state) consentUrl.searchParams.set("state", state);
  return NextResponse.redirect(consentUrl);
}
