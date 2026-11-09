import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import McpClient from "@/models/McpClient";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { validateBody } from "@/lib/validators";
import { getClientIp } from "@/lib/security/clientIp";
import { isAllowedMcpRedirectUri } from "@/lib/mcp/oauth";

const registerSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  // Optional per RFC 7591 §2; a client that leaves it out is named after its
  // redirect host so the consent screen still says who is asking.
  client_name: z.string().trim().min(1).max(200).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).min(1).max(2).optional(),
  response_types: z.array(z.literal("code")).min(1).max(1).optional(),
  logo_uri: z.string().url().optional(),
});

/** Name for a client that registered without one, from where it gets its codes. */
function defaultClientName(redirectUri: string): string {
  const host = new URL(redirectUri).hostname;
  if (host === "chatgpt.com" || host === "chat.openai.com") return "ChatGPT";
  if (host === "claude.ai" || host === "claude.com") return "Claude";
  return "MCP client";
}

/**
 * POST /api/mcp/register — RFC 7591 dynamic client registration.
 * Public (no session yet — this is how ChatGPT self-registers on first
 * connect). Public-client-only: PKCE (S256) at /authorize + /token replaces a
 * client_secret, since ChatGPT's infra can't keep one confidential.
 */
async function register(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = await checkRateLimit(ip, { limit: 10, windowSec: 3600, prefix: "mcp-register" });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Too many registration attempts" },
      { status: 429 }
    );
  }

  const body = await validateBody(req, registerSchema);

  // A client asking for a secret-based method is not refused: RFC 7591 §3.2.1
  // lets the server register it with the method it supports, and the response
  // says token_endpoint_auth_method "none". PKCE still guards every exchange.

  for (const uri of body.redirect_uris) {
    if (!isAllowedMcpRedirectUri(uri)) {
      return NextResponse.json(
        {
          error: "invalid_redirect_uri",
          error_description:
            "redirect_uris must be HTTPS on a supported client host (ChatGPT, Claude) or an exact loopback host",
        },
        { status: 400 }
      );
    }
  }

  if (body.grant_types && !body.grant_types.includes("authorization_code")) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "authorization_code grant is required" },
      { status: 400 },
    );
  }

  await connectDB();

  const clientId = `mcpc_${crypto.randomBytes(16).toString("hex")}`;
  const client = await McpClient.create({
    clientId,
    clientName: body.client_name ?? defaultClientName(body.redirect_uris[0]),
    redirectUris: body.redirect_uris,
    logoUri: body.logo_uri,
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: body.grant_types ?? ["authorization_code", "refresh_token"],
      response_types: body.response_types ?? ["code"],
    },
    { status: 201 }
  );
}

export async function POST(req: NextRequest) {
  try {
    return await register(req);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return NextResponse.json(
      { error: "server_error", error_description: "Registration failed" },
      { status: 500 },
    );
  }
}
