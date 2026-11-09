/**
 * @jest-environment node
 */
/**
 * API Tests — MCP dynamic client registration redirect_uri validation.
 * Guards the hostname check against prefix-match bypasses (localhost.attacker.com).
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("@/models/McpClient", () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (doc: Record<string, unknown>) => doc),
  },
}));

import { POST } from "@/app/api/mcp/register/route";

function register(redirectUris: string[]) {
  return POST(
    new NextRequest("https://app.test/api/mcp/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: redirectUris, client_name: "Test Client" }),
    })
  );
}

describe("POST /api/mcp/register — redirect_uri validation", () => {
  it("rejects hosts that merely start with localhost", async () => {
    const res = await register(["http://localhost.attacker.com/cb"]);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_redirect_uri" });
  });

  it("rejects userinfo smuggled into an https uri", async () => {
    const res = await register(["https://evil.com@good.example.com/cb"]);
    expect(res.status).toBe(400);
  });

  it("rejects plain http on a non-loopback host", async () => {
    const res = await register(["http://good.example.com/cb"]);
    expect(res.status).toBe(400);
  });

  it("rejects https on a host that is not a supported AI client (consent phishing)", async () => {
    const res = await register(["https://chat.example.com/cb"]);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_redirect_uri" });
  });

  it("accepts a supported AI client over https and http loopback", async () => {
    const res = await register(["https://chatgpt.com/connector_platform_oauth_redirect", "http://localhost:3000/cb"]);
    expect(res.status).toBe(201);
  });
});

describe("POST /api/mcp/register — RFC 7591 optional metadata", () => {
  function registerRaw(body: Record<string, unknown>) {
    return POST(
      new NextRequest("https://app.test/api/mcp/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it.each([
    ["https://chatgpt.com/connector/oauth/cb_123", "ChatGPT"],
    ["https://claude.ai/api/mcp/auth_callback", "Claude"],
    ["http://localhost:6274/oauth/callback", "MCP client"],
  ])("registers a client without client_name (%s) under a name from its redirect host", async (uri, name) => {
    const res = await registerRaw({ redirect_uris: [uri] });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ client_name: name, redirect_uris: [uri] });
  });

  it("registers a client that asks for a secret-based method as a public PKCE client", async () => {
    const res = await registerRaw({
      redirect_uris: ["https://chatgpt.com/connector/oauth/cb_123"],
      client_name: "ChatGPT",
      token_endpoint_auth_method: "client_secret_post",
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token_endpoint_auth_method).toBe("none");
    expect(json).not.toHaveProperty("client_secret");
  });
});
