/**
 * @jest-environment node
 *
 * A read tool with a presenter streams a `view` frame, so the panel draws
 * cards, and the model is told the user already sees them so it doesn't
 * retype the rows as a table.
 */
import { NextRequest } from "next/server";
import type { CopilotTool, CopilotToolResult } from "@/lib/ai/copilot/types";

const mockExecute = jest.fn<Promise<CopilotToolResult>, [unknown, unknown]>();
const readTool: CopilotTool<{ limit?: number }> = {
  name: "recommended_jobs",
  description: "Jobs that match me.",
  resource: "jobs",
  action: "read",
  roles: ["job_seeker"],
  mutates: false,
  parameters: { limit: { type: "number", description: "max", optional: true, min: 1, max: 10 } },
  summarize: () => "Match jobs to your profile and CV",
  execute: (args, ctx) => mockExecute(args, ctx),
};

jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => ({ user: { id: "64b000000000000000000001", role: "job_seeker" } })) }));
jest.mock("@/lib/subscription/featureGate", () => ({ enforceFeatureGate: jest.fn(async () => null) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true, resetAt: 0 })), RATE_LIMIT_CONFIGS: { ai: {} } }));
jest.mock("@/lib/ai/dailyQuota", () => ({ enforceDailyAiQuota: jest.fn(async () => null) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));
jest.mock("@/lib/validators", () => ({ validateBody: jest.fn(async (req: Request) => req.json()) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(async () => undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock("@/lib/ai/copilot/pageContext", () => ({ parseEmployerJobIdFromPath: () => null, buildEmployerJobContext: jest.fn() }));
jest.mock("@/lib/ai/copilot/registry", () => ({
  getToolsForUser: () => [readTool],
  getToolByName: (name: string) => (name === readTool.name ? readTool : undefined),
}));
jest.mock("@/models/CopilotProposal", () => ({ __esModule: true, default: { create: jest.fn() } }));

function sse(delta: Record<string, unknown>): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const toolCallTurn = () =>
  sse({ tool_calls: [{ index: 0, id: "call_1", function: { name: readTool.name, arguments: "{}" } }] });
const textTurn = (content: string) => sse({ content });

async function post(message: string) {
  const { POST } = await import("@/app/api/ai/copilot/chat/route");
  const req = new NextRequest("http://localhost/api/ai/copilot/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: message }], currentPage: "/en/job-seeker" }),
  });
  const res = await POST(req);
  return (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
}

const fetchMock = jest.fn();
beforeAll(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  global.fetch = fetchMock as unknown as typeof fetch;
});
beforeEach(() => jest.clearAllMocks());

const job = {
  jobId: "j1",
  title: "Frontend Developer",
  company: "Acme",
  location: "Dubai, UAE",
  matchScore: 90,
  strongMatch: true,
  matchedSkills: ["React"],
  url: "/en/job-seeker/jobs/j1",
};

describe("copilot chat route — views", () => {
  it("streams a view for a read tool with a presenter and tells the model the user sees it", async () => {
    mockExecute.mockResolvedValueOnce({ ok: true, message: "Found 1 strong match(es).", data: { jobs: [job], totalMatches: 1 } });
    fetchMock.mockResolvedValueOnce(toolCallTurn()).mockResolvedValueOnce(textTurn("Acme's role fits you best."));

    const frames = await post("jobs for me");

    const view = frames.find((f) => f.type === "view");
    expect(view).toMatchObject({ tool: "recommended_jobs", view: { kind: "jobs", jobs: [{ jobId: "j1", skills: ["React"] }] } });
    // The view follows its tool result, so the panel can tick the tool line first.
    expect(frames.findIndex((f) => f.type === "view")).toBeGreaterThan(frames.findIndex((f) => f.type === "tool_result"));

    const secondCall = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { messages: Array<{ role: string; content: string }> };
    const toolMsg = JSON.parse(secondCall.messages.find((m) => m.role === "tool")!.content) as Record<string, unknown>;
    expect(toolMsg).toMatchObject({ ok: true, data: { jobs: [{ jobId: "j1" }] }, shownToUser: expect.stringContaining("cards") });
  });

  it("sends no view, and no card note, when the result has nothing to show", async () => {
    mockExecute.mockResolvedValueOnce({ ok: true, message: "No open jobs.", data: { jobs: [], limitingFactor: "no_location" } });
    fetchMock.mockResolvedValueOnce(toolCallTurn()).mockResolvedValueOnce(textTurn("Add a preferred country first."));

    const frames = await post("jobs for me");

    expect(frames.some((f) => f.type === "view")).toBe(false);
    const secondCall = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { messages: Array<{ role: string; content: string }> };
    expect(secondCall.messages.find((m) => m.role === "tool")!.content).not.toContain("shownToUser");
  });
});
