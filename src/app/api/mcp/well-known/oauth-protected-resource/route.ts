import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { getAppBaseUrl } from "@/lib/mcp/baseUrl";

const handler = protectedResourceHandler({
  authServerUrls: [getAppBaseUrl()],
});

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
