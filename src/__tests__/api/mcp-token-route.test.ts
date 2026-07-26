/**
 * @jest-environment node
 */

import crypto from "crypto";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("oauth4webapi", () => ({
  calculatePKCECodeChallenge: jest.fn(async (verifier: string) =>
    require("crypto").createHash("sha256").update(verifier).digest("base64url")
  ),
}));

jest.mock("@/models/McpAuthorizationCode", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock("@/models/McpToken", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

import McpAuthorizationCode from "@/models/McpAuthorizationCode";
import McpToken from "@/models/McpToken";
import User from "@/models/User";
import { POST } from "@/app/api/mcp/token/route";

const authCodeModel = McpAuthorizationCode as unknown as {
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
};
const tokenModel = McpToken as unknown as {
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  create: jest.Mock;
  updateMany: jest.Mock;
};
const userModel = User as unknown as { findById: jest.Mock };

function formRequest(values: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/mcp/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
}

function leanResult(value: unknown) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function userResult(value: unknown) {
  return {
    select: jest.fn(() => leanResult(value)),
  };
}

function s256(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

describe("POST /api/mcp/token security", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    tokenModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    tokenModel.create.mockResolvedValue({});
  });

  it("rejects a token request for another resource", async () => {
    const res = await POST(formRequest({
      grant_type: "refresh_token",
      refresh_token: "mcp_rt_example",
      client_id: "mcpc_example",
      resource: "https://evil.example",
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_target" });
    expect(tokenModel.findOne).not.toHaveBeenCalled();
  });

  it("does not consume an authorization code when the PKCE proof is wrong", async () => {
    const correctVerifier = "a".repeat(43);
    const wrongVerifier = "b".repeat(43);
    authCodeModel.findOne.mockReturnValue(leanResult({
      _id: "code-id",
      clientId: "mcpc_example",
      userId: "user-id",
      role: "job_seeker",
      redirectUri: "https://chatgpt.com/connector/oauth/callback",
      resource: "http://localhost:3000",
      codeChallenge: s256(correctVerifier),
      scopes: ["read:jobs"],
      expiresAt: new Date(Date.now() + 60_000),
    }));

    const res = await POST(formRequest({
      grant_type: "authorization_code",
      code: "mcpac_example",
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      client_id: "mcpc_example",
      code_verifier: wrongVerifier,
      resource: "http://localhost:3000",
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_grant" });
    expect(authCodeModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(tokenModel.create).not.toHaveBeenCalled();
  });

  it("revokes inactive users instead of rotating their refresh token", async () => {
    tokenModel.findOne.mockReturnValue(leanResult({
      _id: "token-id",
      familyId: "family-id",
      clientId: "mcpc_example",
      resource: "http://localhost:3000",
      userId: "user-id",
      role: "employer",
      scopes: ["read:employer_jobs"],
      isRevoked: false,
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      authorizationExpiresAt: new Date(Date.now() + 60_000),
    }));
    userModel.findById.mockReturnValue(userResult({ role: "employer", isActive: false }));

    const res = await POST(formRequest({
      grant_type: "refresh_token",
      refresh_token: "mcp_rt_example",
      client_id: "mcpc_example",
      resource: "http://localhost:3000",
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_grant" });
    expect(tokenModel.updateMany).toHaveBeenCalledWith(
      { userId: "user-id" },
      { $set: { isRevoked: true } },
    );
    expect(tokenModel.create).not.toHaveBeenCalled();
  });

  it("keeps the original authorization deadline when rotating refresh tokens", async () => {
    const authorizationExpiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    const oldToken = {
      _id: "token-id",
      familyId: "family-id",
      clientId: "mcpc_example",
      resource: "http://localhost:3000",
      userId: "user-id",
      role: "admin",
      scopes: ["read:employer_jobs", "read:applicants"],
      isRevoked: false,
      refreshTokenExpiresAt: authorizationExpiresAt,
      authorizationExpiresAt,
    };
    tokenModel.findOne.mockReturnValue(leanResult(oldToken));
    tokenModel.findOneAndUpdate.mockReturnValue(leanResult(oldToken));
    userModel.findById.mockReturnValue(userResult({
      role: "admin",
      isActive: true,
      permissionMode: "role_default",
    }));

    const res = await POST(formRequest({
      grant_type: "refresh_token",
      refresh_token: "mcp_rt_example",
      client_id: "mcpc_example",
      resource: "http://localhost:3000",
    }));

    expect(res.status).toBe(200);
    expect(tokenModel.create).toHaveBeenCalledWith(expect.objectContaining({
      familyId: "family-id",
      refreshTokenExpiresAt: authorizationExpiresAt,
      authorizationExpiresAt,
    }));
  });
});
