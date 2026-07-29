import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { connectDB } from "@/lib/db/mongoose";
import McpAuthorizationCode from "@/models/McpAuthorizationCode";
import McpToken from "@/models/McpToken";
import User from "@/models/User";
import { getMcpResourceUrl } from "@/lib/mcp/baseUrl";
import { isValidPkceVerifier } from "@/lib/mcp/oauth";
import { defaultScopesForRole, type McpScope } from "@/lib/mcp/scopes";

const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1h
const AUTHORIZATION_TTL_SECONDS = 60 * 60 * 24 * 90; // fixed 90d ceiling

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

function tokenSuccess(body: Record<string, unknown>) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

function mintToken(prefix: string) {
  const token = `${prefix}${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function retainAuthorizedScopes(scopes: readonly string[], role: Parameters<typeof defaultScopesForRole>[0]): McpScope[] {
  const allowed = new Set(defaultScopesForRole(role));
  return scopes.filter((scope): scope is McpScope => allowed.has(scope as McpScope));
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
    const resource = params.get("resource") ?? "";
    if (!code || !redirectUri || !clientId || !codeVerifier || !resource) {
      return tokenError("invalid_request", "code, redirect_uri, client_id, code_verifier and resource are required");
    }
    if (!isValidPkceVerifier(codeVerifier)) {
      return tokenError("invalid_grant", "code_verifier is malformed");
    }
    if (resource !== getMcpResourceUrl()) {
      return tokenError("invalid_target", "resource does not identify this MCP server");
    }

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    // Validate the proof before consuming the code. An attacker who only sees
    // the authorization code must not be able to invalidate the legitimate
    // exchange by submitting a deliberately wrong verifier first.
    const authCode = await McpAuthorizationCode.findOne({ codeHash, consumedAt: null }).lean();

    if (!authCode) return tokenError("invalid_grant", "Authorization code is invalid, expired, or already used");
    if (authCode.expiresAt.getTime() < Date.now()) return tokenError("invalid_grant", "Authorization code has expired");
    if (authCode.clientId !== clientId) return tokenError("invalid_grant", "client_id does not match");
    if (authCode.redirectUri !== redirectUri) return tokenError("invalid_grant", "redirect_uri does not match");
    if (authCode.resource !== resource) return tokenError("invalid_target", "resource does not match authorization");

    const expectedChallenge = await calculatePKCECodeChallenge(codeVerifier);
    if (expectedChallenge !== authCode.codeChallenge) {
      return tokenError("invalid_grant", "code_verifier does not match code_challenge");
    }

    const user = await User.findById(authCode.userId)
      .select("role isActive permissionMode customPermissions")
      .lean();
    if (!user?.isActive) return tokenError("invalid_grant", "User authorization is no longer active");
    if (user.role !== authCode.role) {
      return tokenError("invalid_grant", "User role changed; authorization is required again");
    }
    const scopes = retainAuthorizedScopes(authCode.scopes, user.role);
    if (scopes.length === 0) {
      return tokenError("invalid_scope", "No authorized scopes remain for this user");
    }

    const claimed = await McpAuthorizationCode.findOneAndUpdate(
      { _id: authCode._id, consumedAt: null },
      { $set: { consumedAt: new Date() } },
      { returnDocument: "before" },
    ).lean();
    if (!claimed) return tokenError("invalid_grant", "Authorization code was already used");

    const access = mintToken("mcp_at_");
    const refresh = mintToken("mcp_rt_");
    const now = Date.now();
    const authorizationExpiresAt = new Date(now + AUTHORIZATION_TTL_SECONDS * 1000);

    await McpToken.create({
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      familyId: crypto.randomUUID(),
      clientId,
      resource,
      userId: authCode.userId,
      role: user.role,
      scopes,
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshTokenExpiresAt: authorizationExpiresAt,
      authorizationExpiresAt,
    });

    return tokenSuccess({
      access_token: access.token,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh.token,
      scope: scopes.join(" "),
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token") ?? "";
    const clientId = params.get("client_id") ?? "";
    const resource = params.get("resource") ?? "";
    if (!refreshToken || !clientId || !resource) {
      return tokenError("invalid_request", "refresh_token, client_id and resource are required");
    }
    if (resource !== getMcpResourceUrl()) {
      return tokenError("invalid_target", "resource does not identify this MCP server");
    }

    const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const oldToken = await McpToken.findOne({ refreshTokenHash }).lean();

    if (!oldToken) return tokenError("invalid_grant", "Refresh token is invalid");
    if (oldToken.isRevoked) {
      // Reuse of a rotated token invalidates the entire authorization family.
      if (oldToken.familyId) {
        await McpToken.updateMany({ familyId: oldToken.familyId }, { $set: { isRevoked: true } });
      }
      return tokenError("invalid_grant", "Refresh token reuse detected; authorization was revoked");
    }
    if (!oldToken.refreshTokenExpiresAt || oldToken.refreshTokenExpiresAt.getTime() < Date.now()) {
      return tokenError("invalid_grant", "Refresh token has expired");
    }
    if (oldToken.clientId !== clientId) return tokenError("invalid_grant", "client_id does not match");
    if (oldToken.resource !== resource) return tokenError("invalid_target", "resource does not match authorization");

    const authorizationExpiresAt = oldToken.authorizationExpiresAt ?? oldToken.refreshTokenExpiresAt;
    if (!authorizationExpiresAt || authorizationExpiresAt.getTime() < Date.now()) {
      return tokenError("invalid_grant", "Authorization has expired; user consent is required again");
    }

    const user = await User.findById(oldToken.userId)
      .select("role isActive permissionMode customPermissions")
      .lean();
    if (!user?.isActive) {
      await McpToken.updateMany({ userId: oldToken.userId }, { $set: { isRevoked: true } });
      return tokenError("invalid_grant", "User authorization is no longer active");
    }
    if (user.role !== oldToken.role) {
      await McpToken.updateMany({ userId: oldToken.userId }, { $set: { isRevoked: true } });
      return tokenError("invalid_grant", "User role changed; authorization is required again");
    }
    const scopes = retainAuthorizedScopes(oldToken.scopes, user.role);
    if (scopes.length === 0) {
      return tokenError("invalid_scope", "No authorized scopes remain for this user");
    }

    // Atomically claim the refresh token. A concurrent loser is treated as
    // replay and revokes the whole family.
    const claimed = await McpToken.findOneAndUpdate(
      { _id: oldToken._id, isRevoked: false },
      { $set: { isRevoked: true } },
      { returnDocument: "before" },
    ).lean();
    if (!claimed) {
      if (oldToken.familyId) {
        await McpToken.updateMany({ familyId: oldToken.familyId }, { $set: { isRevoked: true } });
      }
      return tokenError("invalid_grant", "Refresh token reuse detected; authorization was revoked");
    }

    const access = mintToken("mcp_at_");
    const refresh = mintToken("mcp_rt_");
    const now = Date.now();
    const accessExpiresAt = new Date(
      Math.min(now + ACCESS_TOKEN_TTL_SECONDS * 1000, authorizationExpiresAt.getTime()),
    );

    await McpToken.create({
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      familyId: oldToken.familyId,
      clientId,
      resource,
      userId: oldToken.userId,
      role: user.role,
      scopes,
      accessTokenExpiresAt: accessExpiresAt,
      refreshTokenExpiresAt: authorizationExpiresAt,
      authorizationExpiresAt,
    });

    return tokenSuccess({
      access_token: access.token,
      token_type: "Bearer",
      expires_in: Math.max(1, Math.floor((accessExpiresAt.getTime() - now) / 1000)),
      refresh_token: refresh.token,
      scope: scopes.join(" "),
    });
  }

  return tokenError("unsupported_grant_type", "Only authorization_code and refresh_token are supported");
}
