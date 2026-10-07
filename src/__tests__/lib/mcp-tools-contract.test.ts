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

    // Reports only (owner decision 2026-10-07): no tool returns records.
    expect([...tools.keys()]).toEqual(["get_summary_report"]);

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
