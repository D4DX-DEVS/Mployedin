/**
 * @jest-environment node
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
  default: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/mcp/reports/admin", () => ({ buildAdminReport: jest.fn() }));
jest.mock("@/lib/mcp/reports/superAgent", () => ({ buildSuperAgentReport: jest.fn() }));
jest.mock("@/lib/mcp/reports/agent", () => ({ buildAgentReport: jest.fn() }));
jest.mock("@/lib/mcp/reports/employer", () => ({ buildEmployerReport: jest.fn() }));
jest.mock("@/lib/mcp/reports/jobSeeker", () => ({ buildJobSeekerReport: jest.fn() }));

import { registerMcpTools } from "@/lib/mcp/tools";
import { buildAdminReport } from "@/lib/mcp/reports/admin";
import { buildSuperAgentReport } from "@/lib/mcp/reports/superAgent";
import { buildAgentReport } from "@/lib/mcp/reports/agent";
import { buildEmployerReport } from "@/lib/mcp/reports/employer";
import { buildJobSeekerReport } from "@/lib/mcp/reports/jobSeeker";

type ToolResult = { isError?: boolean; content: Array<{ text: string }>; structuredContent?: { data: Record<string, unknown> } };
type Handler = (args: { period?: string }, extra: { authInfo?: unknown }) => Promise<ToolResult>;

let handler: Handler;
beforeAll(() => {
  registerMcpTools({
    registerTool: (_name: string, _config: unknown, cb: Handler) => {
      handler = cb;
      return {};
    },
  } as unknown as McpServer);
});

function authFor(role: string, extra: Record<string, unknown> = {}, scopes = ["read:reports"]) {
  return { authInfo: { token: "t", clientId: "c", scopes, extra: { userId: "user-1", role, permissionMode: "role_default", ...extra } } };
}

beforeEach(() => jest.clearAllMocks());

describe("get_summary_report", () => {
  it.each([
    ["admin", buildAdminReport],
    ["super_agent", buildSuperAgentReport],
    ["agent", buildAgentReport],
    ["employer", buildEmployerReport],
    ["job_seeker", buildJobSeekerReport],
  ])("builds the %s report for the token's own user", async (role, builder) => {
    (builder as jest.Mock).mockResolvedValue({ scope: "x", total: 1 });
    const res = await handler({ period: "7d" }, authFor(role));
    expect(res.isError).toBeUndefined();
    expect(builder).toHaveBeenCalledTimes(1);
    const args = (builder as jest.Mock).mock.calls[0];
    if (role !== "admin") expect(args[0]).toBe("user-1");
    expect(res.structuredContent?.data).toMatchObject({ role, period: { key: "7d", days: 7 }, report: { total: 1 } });
  });

  it("strips personal data even if a report builder lets some through", async () => {
    (buildEmployerReport as jest.Mock).mockResolvedValue({
      jobs: { active: 2 },
      leak: { candidateName: "Aisha", email: "aisha@x.co", phone: "+971501234567", userId: "u9", note: "aisha@x.co" },
      byJob: [{ jobTitle: "QA Engineer", hiringManagerName: "Omar", applicants: 3 }],
    });
    const res = await handler({}, authFor("employer"));
    const text = res.content[0].text;
    for (const secret of ["Aisha", "aisha@x.co", "+971501234567", "u9", "Omar"]) expect(text).not.toContain(secret);
    expect(res.structuredContent?.data.report).toEqual({ jobs: { active: 2 }, leak: { note: "[hidden]" }, byJob: [{ jobTitle: "QA Engineer", applicants: 3 }] });
  });

  it("refuses a token without the reports scope", async () => {
    const res = await handler({}, authFor("employer", {}, ["read:jobs"]));
    expect(res.isError).toBe(true);
    expect(buildEmployerReport).not.toHaveBeenCalled();
  });

  it("refuses staff whose custom permissions remove reports, but not seekers or employers", async () => {
    const narrowed = { permissionMode: "custom", customPermissions: { reports: [] } };
    const res = await handler({}, authFor("agent", narrowed));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/do not include reports/);
    expect(buildAgentReport).not.toHaveBeenCalled();
  });

  it("hands the admin report the admin's live per-resource permissions", async () => {
    (buildAdminReport as jest.Mock).mockResolvedValue({ scope: "Whole platform" });
    const narrowed = { permissionMode: "custom", customPermissions: { reports: ["read"], applications: ["read"] } };
    await handler({}, authFor("admin", narrowed));
    const can = (buildAdminReport as jest.Mock).mock.calls[0][1] as (resource: string) => boolean;
    expect(can("applications")).toBe(true);
    expect(can("users")).toBe(false);
    expect(can("agents")).toBe(false);
  });

  it("answers plainly when the account has no profile to report on", async () => {
    (buildAgentReport as jest.Mock).mockResolvedValue(null);
    const res = await handler({}, authFor("agent"));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("No report is available for this account yet.");
  });

  it("never passes a thrown error's message to the AI client", async () => {
    (buildJobSeekerReport as jest.Mock).mockRejectedValue(new Error("MongoServerError: cluster0.abcde.mongodb.net"));
    const res = await handler({}, authFor("job_seeker"));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toContain("mongodb");
  });

  it("denies an unknown role by default", async () => {
    const res = await handler({}, authFor("auditor"));
    expect(res.isError).toBe(true);
  });
});
