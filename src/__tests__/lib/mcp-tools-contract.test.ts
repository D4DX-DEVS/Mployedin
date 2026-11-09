/**
 * @jest-environment node
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpTools } from "@/lib/mcp/tools";

describe("MCP tool contract", () => {
  it("registers every tool with safety annotations and OAuth metadata", () => {
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

    // Reports (2026-10-07) plus latest jobs and brand posters (2026-11 poster plan).
    expect([...tools.keys()].sort()).toEqual(["create_job_posters", "get_summary_report", "list_latest_jobs"]);

    for (const [name, config] of tools) {
      const writes = name === "create_job_posters";
      expect(config.title).toEqual(expect.any(String));
      expect(config.description).toMatch(/^Use this/);
      expect(config.outputSchema).toBeDefined();
      expect(config.annotations).toEqual({
        readOnlyHint: !writes,
        destructiveHint: false,
        idempotentHint: !writes,
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
