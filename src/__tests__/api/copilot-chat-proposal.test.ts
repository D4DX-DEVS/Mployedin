/**
 * @jest-environment node
 *
 * The chat route's proposal branch: a mutating tool's dry run (`preview`)
 * decides whether a confirmation card exists at all, and pins the args the
 * card was built from so `/execute` replays the same selection.
 */
import { NextRequest } from "next/server";
import type { CopilotTool, CopilotToolPreview } from "@/lib/ai/copilot/types";

const JOB_ID = "64b000000000000000000010";

const mockPreview = jest.fn<Promise<CopilotToolPreview>, [unknown, unknown]>();
const mockTool: CopilotTool<{ jobId?: string; count?: number }> = {
  name: "shortlist_top_candidates",
  description: "Shortlist the best N applicants for one job.",
  resource: "applications",
  action: "update",
  roles: ["employer"],
  mutates: true,
  parameters: {
    jobId: { type: "string", description: "job", optional: true, maxLength: 32 },
    count: { type: "number", description: "how many", optional: true, min: 1, max: 100 },
  },
  summarize: (args) => (args.count ? `Shortlist the top ${args.count} candidates` : "Shortlist the best candidates"),
  preview: (args, ctx) => mockPreview(args, ctx),
  execute: jest.fn(async () => ({ ok: true, message: "never called by the chat route" })),
};

jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => ({ user: { id: "64b000000000000000000001", role: "employer" } })) }));
jest.mock("@/lib/subscription/featureGate", () => ({ enforceFeatureGate: jest.fn(async () => null) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true, resetAt: 0 })), RATE_LIMIT_CONFIGS: { ai: {} } }));
jest.mock("@/lib/ai/dailyQuota", () => ({ enforceDailyAiQuota: jest.fn(async () => null) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));
jest.mock("@/lib/validators", () => ({ validateBody: jest.fn(async (req: Request) => req.json()) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(async () => undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock("@/lib/ai/copilot/modelRouter", () => ({ SMALL_MODEL: "small", LARGE_MODEL: "large", classifyComplexity: () => "small" }));
jest.mock("@/lib/ai/copilot/pageContext", () => ({ parseEmployerJobIdFromPath: () => null, buildEmployerJobContext: jest.fn() }));
jest.mock("@/lib/ai/copilot/registry", () => ({
  getToolsForUser: () => [mockTool],
  getToolByName: (name: string) => (name === mockTool.name ? mockTool : undefined),
}));
jest.mock("@/models/CopilotProposal", () => ({
  __esModule: true,
  default: { create: jest.fn(async (doc: Record<string, unknown>) => ({ _id: "prop1", ...doc })) },
}));

/** One OpenRouter SSE body. */
function sse(delta: Record<string, unknown>): Response {
  const body = `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const toolCallTurn = (args: Record<string, unknown>) =>
  sse({ tool_calls: [{ index: 0, id: "call_1", function: { name: mockTool.name, arguments: JSON.stringify(args) } }] });
const textTurn = (content: string) => sse({ content });

async function post(message: string) {
  const { POST } = await import("@/app/api/ai/copilot/chat/route");
  const req = new NextRequest("http://localhost/api/ai/copilot/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: message }], currentPage: `/en/employer/jobs/${JOB_ID}/applications` }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("copilot chat route — proposal branch", () => {
  const fetchMock = jest.fn();
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows no confirm card when the dry run reports a blocker, and hands the reason back to the model", async () => {
    mockPreview.mockResolvedValueOnce({ summary: "Which job should I shortlist for?", blocker: "Which job should I shortlist for? Your postings: A, B" });
    fetchMock.mockResolvedValueOnce(toolCallTurn({ count: 5 })).mockResolvedValueOnce(textTurn("Which job did you mean — A or B?"));

    const frames = await post("shortlist the best 5");
    const CopilotProposal = (await import("@/models/CopilotProposal")).default as unknown as { create: jest.Mock };

    expect(frames.some((f) => f.type === "proposal")).toBe(false);
    expect(frames).toContainEqual(expect.objectContaining({ type: "tool_result", ok: false, message: expect.stringContaining("Which job") }));
    expect(CopilotProposal.create).not.toHaveBeenCalled();
    expect(mockTool.execute).not.toHaveBeenCalled();

    const secondCall = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { messages: Array<{ role: string; content: string }> };
    const toolMsg = secondCall.messages.find((m) => m.role === "tool");
    expect(JSON.parse(toolMsg!.content)).toEqual({ ok: false, message: expect.stringContaining("Which job") });
    expect(frames.at(-2)).toEqual({ type: "text", content: "Which job did you mean — A or B?" });
    expect(frames.at(-1)).toEqual({ type: "done" });
  });

  it("pins the dry run's resolved args into the proposal so execute replays what the card showed", async () => {
    mockPreview.mockResolvedValueOnce({
      summary: "5 of 7 applicants at Applied will move to Shortlisted",
      rows: [{ name: "Alice", score: 91, note: "React" }],
      data: { count: 5 },
      resolvedArgs: { jobId: JOB_ID, count: 5 },
    });
    fetchMock.mockResolvedValueOnce(toolCallTurn({})).mockResolvedValueOnce(textTurn("Confirm the card to shortlist them."));

    const frames = await post("shortlist the best for this job");
    const CopilotProposal = (await import("@/models/CopilotProposal")).default as unknown as { create: jest.Mock };

    const proposal = frames.find((f) => f.type === "proposal") as Record<string, unknown>;
    expect(proposal).toMatchObject({
      proposalId: "prop1",
      tool: mockTool.name,
      summary: "Shortlist the top 5 candidates",
      args: { jobId: JOB_ID, count: 5 },
      preview: { summary: "5 of 7 applicants at Applied will move to Shortlisted", rows: [{ name: "Alice", score: 91, note: "React" }] },
    });
    expect(proposal.preview).not.toHaveProperty("resolvedArgs");
    expect(CopilotProposal.create).toHaveBeenCalledWith(expect.objectContaining({
      toolName: mockTool.name,
      args: { jobId: JOB_ID, count: 5 },
      summary: "Shortlist the top 5 candidates",
      status: "pending",
    }));

    const secondCall = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { messages: Array<{ role: string; content: string }> };
    const toolMsg = JSON.parse(secondCall.messages.find((m) => m.role === "tool")!.content) as Record<string, unknown>;
    expect(toolMsg).toMatchObject({ status: "awaiting_user_confirmation", candidates: [{ name: "Alice", score: 91, note: "React" }] });
  });

  it("still proposes with the model's own args when a dry run throws", async () => {
    mockPreview.mockRejectedValueOnce(new Error("db down"));
    fetchMock.mockResolvedValueOnce(toolCallTurn({ jobId: JOB_ID, count: 3 })).mockResolvedValueOnce(textTurn("Please confirm."));

    const frames = await post("shortlist 3");
    const proposal = frames.find((f) => f.type === "proposal") as Record<string, unknown>;
    expect(proposal).toMatchObject({ args: { jobId: JOB_ID, count: 3 }, summary: "Shortlist the top 3 candidates" });
    expect(proposal.preview).toBeUndefined();
  });
});
