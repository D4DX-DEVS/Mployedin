import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import McpClient from "@/models/McpClient";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { validateBody } from "@/lib/validators";

const registerSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  client_name: z.string().trim().min(1).max(200),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  logo_uri: z.string().url().optional(),
});

/**
 * POST /api/mcp/register — RFC 7591 dynamic client registration.
 * Public (no session yet — this is how ChatGPT self-registers on first
 * connect). Public-client-only: PKCE (S256) at /authorize + /token replaces a
 * client_secret, since ChatGPT's infra can't keep one confidential.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const rl = await checkRateLimit(ip, { limit: 10, windowSec: 3600, prefix: "mcp-register" });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Too many registration attempts" },
      { status: 429 }
    );
  }

  const body = await validateBody(req, registerSchema);

  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "Only public clients (token_endpoint_auth_method=none) with PKCE are supported",
      },
      { status: 400 }
    );
  }

  for (const uri of body.redirect_uris) {
    if (!uri.startsWith("https://") && !uri.startsWith("http://localhost")) {
      return NextResponse.json(
        { error: "invalid_redirect_uri", error_description: "redirect_uris must use https" },
        { status: 400 }
      );
    }
  }

  await connectDB();

  const clientId = `mcpc_${crypto.randomBytes(16).toString("hex")}`;
  const client = await McpClient.create({
    clientId,
    clientName: body.client_name,
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
