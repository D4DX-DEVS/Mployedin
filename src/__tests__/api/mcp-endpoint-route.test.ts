/**
 * @jest-environment node
 */

/**
 * End-to-end through the real /api/mcp route: auth wrapper, rate limiter and
 * mcp-handler. Guards the bug where mcp-handler (which only serves
 * `${basePath}/mcp`) answered every signed-in request with a bare 404 because
 * the route at /api/mcp never told it its base path.
 */

jest.mock("@/lib/mcp/verifyToken", () => ({
  verifyMcpToken: jest.fn(async (_req: Request, bearer?: string) =>
    bearer === "mcp_at_valid"
      ? {
          token: bearer,
          clientId: "mcpc_test",
          scopes: ["read:jobs"],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          extra: { userId: "user-1", role: "job_seeker", permissionMode: "role_default" },
        }
      : undefined,
  ),
}));

jest.mock("@/lib/mcp/tools", () => {
  const { z } = jest.requireActual("zod");
  return {
    registerMcpTools: (server: {
      registerTool: (name: string, config: unknown, cb: () => unknown) => void;
    }) => {
      server.registerTool(
        "ping_tool",
        { title: "Ping", description: "test tool", inputSchema: { echo: z.string().optional() } },
        () => ({ content: [{ type: "text", text: "pong" }] }),
      );
    },
  };
});

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 }),
}));

// mcp-handler starts a module-level setInterval (stale-server cleanup) that
// would keep Jest alive forever; unref it so the run can exit.
const realSetInterval = global.setInterval;
jest.spyOn(global, "setInterval").mockImplementation(((handler: () => void, ms?: number) => {
  const timer = realSetInterval(handler, ms);
  timer.unref?.();
  return timer;
}) as typeof setInterval);

let POST: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import("@/app/api/mcp/route"));
});

const URL_ = "https://app.test/api/mcp";

function rpc(body: unknown, token = "mcp_at_valid") {
  return POST(
    new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Streamable HTTP may answer as JSON or as one SSE `data:` frame. */
async function payload(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  const data = text.split("\n").find((line) => line.startsWith("data:"));
  return JSON.parse(data ? data.slice(5) : text);
}

describe("POST /api/mcp (real mcp-handler)", () => {
  it("rejects a request without a valid token with 401 and a login hint", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "mcp_at_wrong");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("completes initialize for a signed-in client instead of answering 404", async () => {
    const res = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "jest", version: "1.0.0" },
      },
    });
    expect(res.status).toBe(200);
    const body = await payload(res);
    expect(body).toMatchObject({
      id: 1,
      result: { serverInfo: { name: "mployedin" } },
    });
  });

  it("lists the registered tools", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res.status).toBe(200);
    const body = (await payload(res)) as { result?: { tools?: Array<{ name: string }> } };
    expect(body.result?.tools?.map((tool) => tool.name)).toContain("ping_tool");
  });
});
