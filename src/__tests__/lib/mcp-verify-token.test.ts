/**
 * @jest-environment node
 */

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/models/McpToken", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

import McpToken from "@/models/McpToken";
import User from "@/models/User";
import { verifyMcpToken } from "@/lib/mcp/verifyToken";

const tokenModel = McpToken as unknown as {
  findOne: jest.Mock;
  updateOne: jest.Mock;
  updateMany: jest.Mock;
};
const userModel = User as unknown as { findById: jest.Mock };

function leanResult(value: unknown) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function userResult(value: unknown) {
  return { select: jest.fn(() => leanResult(value)) };
}

function validToken(overrides: Record<string, unknown> = {}) {
  return {
    _id: "token-id",
    clientId: "mcpc_example",
    resource: "http://localhost:3000",
    userId: "user-id",
    role: "employer",
    scopes: ["read:employer_jobs", "read:applicants"],
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
    authorizationExpiresAt: new Date(Date.now() + 120_000),
    ...overrides,
  };
}

describe("verifyMcpToken live authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    tokenModel.updateOne.mockResolvedValue({});
    tokenModel.updateMany.mockResolvedValue({});
  });

  it("rejects and revokes an inactive user", async () => {
    tokenModel.findOne.mockReturnValue(leanResult(validToken()));
    userModel.findById.mockReturnValue(userResult({ role: "employer", isActive: false }));

    await expect(verifyMcpToken(new Request("http://localhost:3000/api/mcp"), "secret"))
      .resolves.toBeUndefined();
    expect(tokenModel.updateMany).toHaveBeenCalledWith(
      { userId: "user-id" },
      { $set: { isRevoked: true } },
    );
  });

  it("rejects and revokes a stale role snapshot", async () => {
    tokenModel.findOne.mockReturnValue(leanResult(validToken()));
    userModel.findById.mockReturnValue(userResult({ role: "admin", isActive: true }));

    await expect(verifyMcpToken(new Request("http://localhost:3000/api/mcp"), "secret"))
      .resolves.toBeUndefined();
    expect(tokenModel.updateMany).toHaveBeenCalled();
  });

  it("returns current custom permissions for every tool authorization", async () => {
    tokenModel.findOne.mockReturnValue(leanResult(validToken()));
    userModel.findById.mockReturnValue(userResult({
      role: "employer",
      isActive: true,
      permissionMode: "custom",
      customPermissions: { jobs: ["read"] },
    }));

    const auth = await verifyMcpToken(
      new Request("http://localhost:3000/api/mcp"),
      "secret",
    );

    expect(auth).toMatchObject({
      clientId: "mcpc_example",
      scopes: ["read:employer_jobs", "read:applicants"],
      extra: {
        userId: "user-id",
        role: "employer",
        permissionMode: "custom",
        customPermissions: { jobs: ["read"] },
      },
    });
    expect(tokenModel.updateOne).toHaveBeenCalled();
  });
});
