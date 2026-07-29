/**
 * @jest-environment node
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpTools } from "@/lib/mcp/tools";

describe("MCP tool contract", () => {
  it("registers every tool with read-only safety and OAuth metadata", () => {
    const tools = new Map<string, Record<string, unknown>>();
    const fakeServer = {
      registerTool: (
        name: string,
        config: Record<string, unknown>,
        _handler: unknown,
      ) => {
        tools.set(name, config);
        return {};
      },
    } as unknown as McpServer;

    registerMcpTools(fakeServer);

    expect([...tools.keys()]).toEqual([
      "search_jobs",
      "get_job_details",
      "get_recommended_jobs",
      "list_my_applications",
      "get_my_profile",
      "list_my_job_postings",
      "list_applicants",
    ]);

    for (const config of tools.values()) {
      expect(config.title).toEqual(expect.any(String));
      expect(config.description).toMatch(/^Use this when/);
      expect(config.outputSchema).toBeDefined();
      expect(config.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(config._meta).toEqual({
        securitySchemes: [
          { type: "oauth2", scopes: [expect.any(String)] },
        ],
      });
    }
  });
});
