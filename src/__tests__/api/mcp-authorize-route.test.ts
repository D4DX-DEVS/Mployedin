/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

process.env.NEXTAUTH_URL = "https://app.test";

jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
  default: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 }),
}));
jest.mock("@/models/McpClient", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import { auth } from "@/lib/auth/config";
import McpClient from "@/models/McpClient";
import { GET } from "@/app/api/mcp/authorize/route";
import { safeCallbackPath } from "@/lib/routing/callbackUrl";

const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

function authorizeRequest() {
  const url = new URL("https://app.test/api/mcp/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "mcpc_1");
  url.searchParams.set("redirect_uri", REDIRECT);
  url.searchParams.set("code_challenge", "A".repeat(43));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", "https://app.test");
  url.searchParams.set("scope", "read:jobs");
  url.searchParams.set("state", "st/ate://x");
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  (McpClient as unknown as { findOne: jest.Mock }).findOne.mockReturnValue({
    lean: jest.fn().mockResolvedValue({ clientId: "mcpc_1", redirectUris: [REDIRECT] }),
  });
});

describe("GET /api/mcp/authorize", () => {
  it("sends a signed-out user to login with a callback the login page will actually follow", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const res = await GET(authorizeRequest());

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/en/login");
    const callback = location.searchParams.get("callbackUrl");
    // Login drops anything safeCallbackPath rejects and lands on the dashboard,
    // which silently broke every connect from a signed-out browser.
    expect(safeCallbackPath(callback, "en")).toBe(callback);

    const consent = new URL(callback ?? "", "https://app.test");
    expect(consent.pathname).toBe("/en/mcp-authorize");
    expect(consent.searchParams.get("client_id")).toBe("mcpc_1");
    expect(consent.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(consent.searchParams.get("state")).toBe("st/ate://x");
  });

  it("sends a signed-in user straight to the consent screen", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "u1", role: "job_seeker" } });
    const res = await GET(authorizeRequest());
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/en/mcp-authorize");
    expect(location.searchParams.get("resource")).toBe("https://app.test");
  });
});
