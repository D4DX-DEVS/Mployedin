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

  it("accepts https and http loopback", async () => {
    const res = await register(["https://chat.example.com/cb", "http://localhost:3000/cb"]);
    expect(res.status).toBe(201);
  });
});
