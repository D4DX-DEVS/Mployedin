import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/mcp/baseUrl";
import { MCP_SCOPES } from "@/lib/mcp/scopes";

/**
 * RFC 8414 authorization server metadata. Public, unauthenticated — this is
 * how the MCP client (ChatGPT) discovers where to register/authorize/exchange
 * tokens before any user is signed in.
 */
export async function GET() {
  const base = getAppBaseUrl();
  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/authorize`,
    token_endpoint: `${base}/api/mcp/token`,
    revocation_endpoint: `${base}/api/mcp/revoke`,
    registration_endpoint: `${base}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: MCP_SCOPES,
  });
}
