import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { connectDB } from "@/lib/db/mongoose";
import McpAuthorizationCode from "@/models/McpAuthorizationCode";
import McpToken from "@/models/McpToken";

const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1h
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90d

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}

function mintToken(prefix: string) {
  const token = `${prefix}${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

async function parseParams(req: NextRequest): Promise<URLSearchParams> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return new URLSearchParams(
      Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
    );
  }
  const form = await req.formData();
  const params = new URLSearchParams();
  for (const [key, value] of form.entries()) params.set(key, String(value));
  return params;
}

/**
 * POST /api/mcp/token — OAuth 2.1 token endpoint.
 * No session required: this is a server-to-server / PKCE-authenticated
 * exchange from the MCP client (ChatGPT), never a browser request carrying
 * our session or CSRF cookie — see CSRF_EXEMPT_PREFIXES.
 */
export async function POST(req: NextRequest) {
  const params = await parseParams(req);
  const grantType = params.get("grant_type");

  await connectDB();

  if (grantType === "authorization_code") {
    const code = params.get("code") ?? "";
    const redirectUri = params.get("redirect_uri") ?? "";
    const clientId = params.get("client_id") ?? "";
    const codeVerifier = params.get("code_verifier") ?? "";
    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return tokenError("invalid_request", "code, redirect_uri, client_id and code_verifier are required");
    }

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    // Atomically claim the code — findOneAndUpdate with consumedAt:null in the
    // filter means a replayed/raced second exchange can never succeed twice.
    const authCode = await McpAuthorizationCode.findOneAndUpdate(
      { codeHash, consumedAt: null },
      { $set: { consumedAt: new Date() } },
      { returnDocument: "before" } // return the pre-update doc so we can still validate it below
    ).lean();

    if (!authCode) return tokenError("invalid_grant", "Authorization code is invalid, expired, or already used");
    if (authCode.expiresAt.getTime() < Date.now()) return tokenError("invalid_grant", "Authorization code has expired");
    if (authCode.clientId !== clientId) return tokenError("invalid_grant", "client_id does not match");
    if (authCode.redirectUri !== redirectUri) return tokenError("invalid_grant", "redirect_uri does not match");

    const expectedChallenge = await calculatePKCECodeChallenge(codeVerifier);
    if (expectedChallenge !== authCode.codeChallenge) {
      return tokenError("invalid_grant", "code_verifier does not match code_challenge");
    }

    const access = mintToken("mcp_at_");
    const refresh = mintToken("mcp_rt_");
    const now = Date.now();

    await McpToken.create({
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      clientId,
      userId: authCode.userId,
      role: authCode.role,
      scopes: authCode.scopes,
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return NextResponse.json({
      access_token: access.token,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh.token,
      scope: authCode.scopes.join(" "),
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token") ?? "";
    const clientId = params.get("client_id") ?? "";
    if (!refreshToken || !clientId) {
      return tokenError("invalid_request", "refresh_token and client_id are required");
    }

    const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    // Rotation: atomically revoke the old token so a stolen-and-replayed
    // refresh token can never be used twice, then mint a fresh pair.
    const oldToken = await McpToken.findOneAndUpdate(
      { refreshTokenHash, isRevoked: false },
      { $set: { isRevoked: true } },
      { returnDocument: "before" }
    ).lean();

    if (!oldToken) return tokenError("invalid_grant", "Refresh token is invalid or already used");
    if (!oldToken.refreshTokenExpiresAt || oldToken.refreshTokenExpiresAt.getTime() < Date.now()) {
      return tokenError("invalid_grant", "Refresh token has expired");
    }
    if (oldToken.clientId !== clientId) return tokenError("invalid_grant", "client_id does not match");

    const access = mintToken("mcp_at_");
    const refresh = mintToken("mcp_rt_");
    const now = Date.now();

    await McpToken.create({
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      clientId,
      userId: oldToken.userId,
      role: oldToken.role,
      scopes: oldToken.scopes,
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return NextResponse.json({
      access_token: access.token,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh.token,
      scope: oldToken.scopes.join(" "),
    });
  }

  return tokenError("unsupported_grant_type", "Only authorization_code and refresh_token are supported");
}
