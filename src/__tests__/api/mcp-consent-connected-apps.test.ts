/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

process.env.NEXTAUTH_URL = "https://app.test";

type Ctx = {
  userId: string;
  role: string;
  locale: string;
  member?: { actorId: string };
};

// Route modules are imported (and call withAuth) before this file's own
// top-level code runs, so the captured state lives inside the mock module.
jest.mock("@/lib/auth/withAuth", () => {
  const state = {
    options: [] as unknown[],
    ctx: { userId: "owner-1", role: "employer", locale: "en" } as Ctx,
  };
  return {
    __state: state,
    withAuth: (
      handler: (req: NextRequest, ctx: Ctx, params?: Record<string, string>) => Promise<Response>,
      options?: unknown,
    ) => {
      state.options.push(options);
      return (req: NextRequest, context?: { params: Promise<Record<string, string>> }) =>
        Promise.resolve(context?.params ?? {})
          .then((params) => handler(req, state.ctx, params))
          // Like the real withAuth: validateBody() throws its 400 response.
          .catch((err: unknown) => {
            if (err instanceof Response) return err;
            throw err;
          });
    },
  };
});

const withAuthState = (jest.requireMock("@/lib/auth/withAuth") as {
  __state: { options: unknown[]; ctx: Ctx };
}).__state;
const mockCtx = {
  set current(ctx: Ctx) {
    withAuthState.ctx = ctx;
  },
};
const mockWithAuthOptions = withAuthState.options;

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 }),
}));

jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/models/McpClient", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), find: jest.fn() },
}));

jest.mock("@/models/McpAuthorizationCode", () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}) },
}));

jest.mock("@/models/McpToken", () => ({
  __esModule: true,
  default: { find: jest.fn(), updateMany: jest.fn() },
}));

import McpClient from "@/models/McpClient";
import McpAuthorizationCode from "@/models/McpAuthorizationCode";
import McpToken from "@/models/McpToken";
import { logActivity } from "@/lib/audit/log";
import { POST as consentPOST } from "@/app/api/mcp/consent/route";
import { GET as appsGET } from "@/app/api/user/connected-apps/route";
import { DELETE as appsDELETE } from "@/app/api/user/connected-apps/[id]/route";
import { MCP_AUTHORIZATION_TTL_SECONDS } from "@/lib/mcp/oauth";

const clientModel = McpClient as unknown as { findOne: jest.Mock; find: jest.Mock };
const codeModel = McpAuthorizationCode as unknown as { create: jest.Mock };
const tokenModel = McpToken as unknown as { find: jest.Mock; updateMany: jest.Mock };

const CHATGPT_REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const CHALLENGE = "A".repeat(43);
const FAMILY = "0b9a4c1e-3f4d-4c8a-9a51-2f0d6e7b8c90";

function lean<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function consent(body: Record<string, unknown>) {
  return consentPOST(
    new NextRequest("https://app.test/api/mcp/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "approve",
        client_id: "mcpc_1",
        redirect_uri: CHATGPT_REDIRECT,
        code_challenge: CHALLENGE,
        resource: "https://app.test",
        scope: "read:employer_jobs read:applicants",
        state: "s1",
        ...body,
      }),
    }),
    { params: Promise.resolve({}) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCtx.current = { userId: "owner-1", role: "employer", locale: "en" };
  clientModel.findOne.mockReturnValue(
    lean({ clientId: "mcpc_1", clientName: "ChatGPT", redirectUris: [CHATGPT_REDIRECT, "https://evil.example/cb"] }),
  );
});

describe("POST /api/mcp/consent", () => {
  it("opts out of tenant view so an approval is never minted in an employer's name", () => {
    // consent, connected-apps GET and DELETE all register with skipTenantView.
    expect(mockWithAuthOptions).toEqual([
      { skipTenantView: true },
      { skipTenantView: true },
      { skipTenantView: true },
    ]);
  });

  it("mints a code for the signed-in owner, bound to the resource, and audits it", async () => {
    const res = await consent({});
    expect(res.status).toBe(200);
    const { redirectTo } = await res.json();
    const url = new URL(redirectTo);
    expect(url.origin + url.pathname).toBe(CHATGPT_REDIRECT);
    expect(url.searchParams.get("code")).toMatch(/^mcpac_[0-9a-f]{64}$/);
    expect(url.searchParams.get("state")).toBe("s1");
    expect(codeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-1", role: "employer", resource: "https://app.test" }),
    );
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "mcp.connected", actorId: "owner-1" }));
  });

  it("refuses an employer's team member instead of minting the owner's access", async () => {
    mockCtx.current = { userId: "owner-1", role: "employer", locale: "en", member: { actorId: "member-9" } };
    const res = await consent({});
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: "team_member_not_allowed" });
    expect(codeModel.create).not.toHaveBeenCalled();
  });

  it("still lets a team member deny, returning access_denied to the app", async () => {
    mockCtx.current = { userId: "owner-1", role: "employer", locale: "en", member: { actorId: "member-9" } };
    const res = await consent({ decision: "deny" });
    expect(res.status).toBe(200);
    const { redirectTo } = await res.json();
    expect(new URL(redirectTo).searchParams.get("error")).toBe("access_denied");
  });

  it("rejects a request without the resource the consent form must send", async () => {
    const res = await consent({ resource: undefined });
    expect(res.status).toBe(400);
    expect(codeModel.create).not.toHaveBeenCalled();
  });

  it("refuses a redirect registered before the host allow-list", async () => {
    const res = await consent({ redirect_uri: "https://evil.example/cb" });
    expect(res.status).toBe(400);
    expect(codeModel.create).not.toHaveBeenCalled();
  });
});

describe("Connected apps API", () => {
  function tokensQuery(rows: unknown[]) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rows),
    };
    tokenModel.find.mockReturnValue(chain);
    return chain;
  }

  it("lists one entry per grant, newest token first, with the app's name", async () => {
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    tokensQuery([
      { familyId: FAMILY, clientId: "mcpc_1", scopes: ["read:applicants"], createdAt: new Date(), authorizationExpiresAt: expires },
      { familyId: FAMILY, clientId: "mcpc_1", scopes: ["read:applicants"], createdAt: new Date(0), authorizationExpiresAt: expires },
    ]);
    clientModel.find.mockReturnValue({ select: jest.fn(() => lean([{ clientId: "mcpc_1", clientName: "ChatGPT" }])) });

    const res = await appsGET(new NextRequest("https://app.test/api/user/connected-apps"), { params: Promise.resolve({}) });
    const { apps } = await res.json();
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ id: FAMILY, clientName: "ChatGPT", scopes: ["read:applicants"] });
    expect(new Date(apps[0].connectedAt).getTime()).toBe(expires.getTime() - MCP_AUTHORIZATION_TTL_SECONDS * 1000);
    expect(tokenModel.find).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner-1", isRevoked: false }));
  });

  it("shows a team member their own grants, never the owner's", async () => {
    mockCtx.current = { userId: "owner-1", role: "employer", locale: "en", member: { actorId: "member-9" } };
    tokensQuery([]);
    clientModel.find.mockReturnValue({ select: jest.fn(() => lean([])) });

    await appsGET(new NextRequest("https://app.test/api/user/connected-apps"), { params: Promise.resolve({}) });
    expect(tokenModel.find).toHaveBeenCalledWith(expect.objectContaining({ userId: "member-9" }));
  });

  it("revokes only the signed-in user's own grant and audits it", async () => {
    tokenModel.updateMany.mockResolvedValue({ matchedCount: 2 });
    const res = await appsDELETE(
      new NextRequest(`https://app.test/api/user/connected-apps/${FAMILY}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: FAMILY }) },
    );
    expect(res.status).toBe(200);
    expect(tokenModel.updateMany).toHaveBeenCalledWith(
      { familyId: FAMILY, userId: "owner-1", isRevoked: false },
      { $set: { isRevoked: true } },
    );
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "mcp.disconnected", resourceId: FAMILY }));
  });

  it("answers 404 for someone else's grant or a malformed id", async () => {
    tokenModel.updateMany.mockResolvedValue({ matchedCount: 0 });
    const other = await appsDELETE(
      new NextRequest(`https://app.test/api/user/connected-apps/${FAMILY}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: FAMILY }) },
    );
    expect(other.status).toBe(404);

    const bad = await appsDELETE(
      new NextRequest("https://app.test/api/user/connected-apps/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: "{\"$ne\":null}" }) },
    );
    expect(bad.status).toBe(404);
    expect(tokenModel.updateMany).toHaveBeenCalledTimes(1);
  });
});
