import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import McpToken from "@/models/McpToken";
import { normalizeMcpResource } from "@/lib/mcp/baseUrl";
import { getClientIp } from "@/lib/security/clientIp";
import { MCP_RATE_LIMITS, mcpRateLimited } from "@/lib/mcp/rateLimit";

async function parseParams(req: NextRequest): Promise<URLSearchParams> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return new URLSearchParams(
      Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value)])),
    );
  }
  const form = await req.formData();
  const params = new URLSearchParams();
  for (const [key, value] of form.entries()) params.set(key, String(value));
  return params;
}

/** RFC 7009-style revocation for public PKCE clients. Unknown tokens still return 200. */
export async function POST(req: NextRequest) {
  const params = await parseParams(req);
  const rawToken = params.get("token") ?? "";
  const clientId = params.get("client_id") ?? "";
  const resource = params.get("resource") ?? "";

  const limited = await mcpRateLimited([
    [getClientIp(req.headers), MCP_RATE_LIMITS.revokePerIp],
    [clientId || "anonymous", MCP_RATE_LIMITS.revokePerClient],
  ]);
  if (limited) return limited;

  // RFC 7009 has no resource parameter; when a client sends one anyway it must
  // still name this server. Tokens are matched by hash + client only, so legacy
  // origin-bound and canonical tokens revoke alike.
  if (!rawToken || !clientId || (resource && !normalizeMcpResource(resource))) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "token and client_id are required; resource, if sent, must name this server" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  await connectDB();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const token = await McpToken.findOne({
    clientId,
    $or: [{ accessTokenHash: tokenHash }, { refreshTokenHash: tokenHash }],
  }).lean();

  if (token?.familyId) {
    await McpToken.updateMany({ familyId: token.familyId }, { $set: { isRevoked: true } });
  } else if (token) {
    await McpToken.updateOne({ _id: token._id }, { $set: { isRevoked: true } });
  }

  return new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}
