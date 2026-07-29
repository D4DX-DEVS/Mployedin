import { generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { getAppBaseUrl, getMcpResourceUrl } from "@/lib/mcp/baseUrl";
import { MCP_SCOPES } from "@/lib/mcp/scopes";

export function GET() {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [getAppBaseUrl()],
    resourceUrl: getMcpResourceUrl(),
    additionalMetadata: {
      scopes_supported: MCP_SCOPES,
      resource_documentation: `${getAppBaseUrl()}/en/privacy`,
    },
  });

  return Response.json(metadata, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
