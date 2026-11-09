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
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn() }));
jest.mock("@/lib/mcp/baseUrl", () => ({
  getAppBaseUrl: () => "https://app.test",
  getMcpResourceMetadataUrl: () => "https://app.test/.well-known/oauth-protected-resource",
}));
jest.mock("@/lib/poster/brandPosters.server", () => {
  class BrandPosterError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
  return { BrandPosterError, createBrandPoster: jest.fn() };
});
jest.mock("@/lib/poster/renderBrandPoster.server", () => ({ renderBrandPosterBase64: jest.fn().mockResolvedValue("UE5H") }));

const jobQuery = { select: jest.fn(), sort: jest.fn(), limit: jest.fn(), lean: jest.fn() };
jobQuery.select.mockReturnValue(jobQuery);
jobQuery.sort.mockReturnValue(jobQuery);
jobQuery.limit.mockReturnValue(jobQuery);
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: jest.fn(() => jobQuery) } }));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([{ _id: "e1", companyName: "Acme" }]) }) })),
    findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ _id: "e1" }) }) })),
  },
}));

import { registerJobPosterTools } from "@/lib/mcp/jobPosterTools";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { BrandPosterError, createBrandPoster } from "@/lib/poster/brandPosters.server";
import Job from "@/models/Job";

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: string; text?: string; data?: string }>;
  structuredContent?: { data: Record<string, unknown> };
};
type Handler = (args: Record<string, unknown>, extra: { authInfo?: unknown }) => Promise<ToolResult>;

const handlers = new Map<string, Handler>();
beforeAll(() => {
  registerJobPosterTools({
    registerTool: (name: string, _config: unknown, cb: Handler) => {
      handlers.set(name, cb);
      return {};
    },
  } as unknown as McpServer);
});

function authFor(role: string, scopes: string[]) {
  return { authInfo: { token: "t", clientId: "c", scopes, extra: { userId: "user-1", role, permissionMode: "role_default" } } };
}

const JOB_ID = "6ae085265b3b1df3538e9d25";

beforeEach(() => {
  jest.clearAllMocks();
  jobQuery.lean.mockResolvedValue([
    { _id: JOB_ID, title: "QA Engineer", employerId: "e1", location: { city: "Dubai", country: "UAE" }, employmentType: "full_time", createdAt: new Date("2026-11-08") },
  ]);
});

describe("list_latest_jobs", () => {
  const list = (args: Record<string, unknown>, auth: ReturnType<typeof authFor>) => handlers.get("list_latest_jobs")!(args, auth);

  it("lists an agent's own companies' active jobs with public fields only", async () => {
    (getScopedEmployerIds as jest.Mock).mockResolvedValue(["e1"]);
    const res = await list({ sinceDays: 3, limit: 5 }, authFor("agent", ["read:reports", "read:jobs"]));
    expect(res.isError).toBeUndefined();
    const filter = (Job.find as jest.Mock).mock.calls[0][0];
    expect(filter).toMatchObject({ status: "active", deletedAt: null, employerId: { $in: ["e1"] } });
    expect(jobQuery.limit).toHaveBeenCalledWith(5);
    expect(res.structuredContent?.data).toEqual({
      sinceDays: 3,
      jobs: [{
        id: JOB_ID, title: "QA Engineer", company: "Acme", location: "Dubai, UAE",
        employmentType: "full_time", postedAt: new Date("2026-11-08"), applyUrl: `https://app.test/jobs/${JOB_ID}`,
      }],
    });
  });

  it("gives admins every company and nobody else an unscoped list", async () => {
    (getScopedEmployerIds as jest.Mock).mockResolvedValue(null);
    await list({}, authFor("admin", ["read:jobs"]));
    expect((Job.find as jest.Mock).mock.calls[0][0].employerId).toBeUndefined();

    (Job.find as jest.Mock).mockClear();
    const res = await list({}, authFor("employer", ["read:jobs"]));
    expect(res.isError).toBe(true);
    expect(Job.find).not.toHaveBeenCalled();
  });

  it("returns nothing for a scope with no companies", async () => {
    (getScopedEmployerIds as jest.Mock).mockResolvedValue([]);
    const res = await list({}, authFor("super_agent", ["read:jobs"]));
    expect(res.structuredContent?.data).toEqual({ sinceDays: 7, jobs: [] });
    expect(Job.find).not.toHaveBeenCalled();
  });

  it("asks an older token without read:jobs to reconnect", async () => {
    const res = await list({}, authFor("employer", ["read:reports"]));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Reconnect/);
    expect(getScopedEmployerIds).not.toHaveBeenCalled();
  });
});

describe("create_job_posters", () => {
  const make = (args: Record<string, unknown>, auth: ReturnType<typeof authFor>) => handlers.get("create_job_posters")!(args, auth);

  it("saves an employer's poster against their own company and returns the image", async () => {
    (createBrandPoster as jest.Mock).mockResolvedValue({ id: "p1", shareSlug: "abc123XYZ0", jobTitle: "QA Engineer", companyName: "Acme" });
    const res = await make({ jobIds: [JOB_ID], brand: "mployedin", style: "urgent" }, authFor("employer", ["write:posters"]));
    expect(res.isError).toBeUndefined();
    expect(createBrandPoster).toHaveBeenCalledWith(expect.objectContaining({
      jobId: JOB_ID, employerId: "e1", source: "mployedin", look: "urgent", layout: "spotlight", locale: "en", actorUserId: "user-1",
    }));
    const posters = res.structuredContent?.data.posters as Array<Record<string, unknown>>;
    expect(posters[0]).toMatchObject({
      shareUrl: "https://app.test/poster/abc123XYZ0",
      qrOpens: `https://app.test/jobs/${JOB_ID}`,
      images: { square: "https://app.test/api/poster/abc123XYZ0/image?size=square" },
    });
    expect(res.content.find((c) => c.type === "image")).toEqual({ type: "image", data: "UE5H", mimeType: "image/png" });
  });

  it("lets admins make posters for any company's job", async () => {
    (createBrandPoster as jest.Mock).mockResolvedValue({ id: "p1", shareSlug: "abc123XYZ0", jobTitle: "QA", companyName: "Acme" });
    await make({ jobIds: [JOB_ID] }, authFor("admin", ["write:posters"]));
    expect((createBrandPoster as jest.Mock).mock.calls[0][0].employerId).toBeNull();
  });

  it("reports another company's job per poster instead of failing the call", async () => {
    (createBrandPoster as jest.Mock).mockRejectedValue(new BrandPosterError(403, "This job does not belong to your company"));
    const res = await make({ jobIds: [JOB_ID] }, authFor("employer", ["write:posters"]));
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent?.data.posters).toEqual([{ jobId: JOB_ID, error: "Not your company's job" }]);
  });

  it("refuses agents and tokens without write:posters", async () => {
    expect((await make({ jobIds: [JOB_ID] }, authFor("agent", ["write:posters"]))).isError).toBe(true);
    expect((await make({ jobIds: [JOB_ID] }, authFor("employer", ["read:jobs"]))).isError).toBe(true);
    expect(createBrandPoster).not.toHaveBeenCalled();
  });
});
