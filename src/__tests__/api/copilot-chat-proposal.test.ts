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
jest.mock("@/lib/ai/copilot/pageContext", () => ({ parseEmployerJobIdFromPath: () => null, buildEmployerJobContext: jest.fn() }));
jest.mock("@/lib/ai/copilot/registry", () => ({
  getToolsForUser: () => [mockTool],
  getToolByName: (name: string) => (name === mockTool.name ? mockTool : undefined),
}));
jest.mock("@/models/CopilotProposal", () => ({
  __esModule: true,
  default: { create: jest.fn(async (doc: Record<string, unknown>) => ({ _id: "prop1", ...doc })) },
}));

/** One OpenAI-format SSE body, as OpenRouter streams it. */
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

  it("echoes Gemini's thought_signature back on the tool call it answers", async () => {
    // Gemini 3.x attaches extra_content.google.thought_signature to every tool
    // call delta and answers the follow-up with 400 "Function call is missing a
    // thought_signature" unless the assistant message carries it back verbatim.
    // Dropping it while assembling deltas broke every Copilot turn that used a
    // tool (2026-09-16); this pins the round trip.
    const signature = { google: { thought_signature: "sig-abc" } };
    mockPreview.mockResolvedValueOnce({ summary: "Which job should I shortlist for?", blocker: "Which job?" });
    fetchMock
      .mockResolvedValueOnce(
        sse({ tool_calls: [{ index: 0, id: "call_1", function: { name: mockTool.name, arguments: "{}" }, extra_content: signature }] }),
      )
      .mockResolvedValueOnce(textTurn("Which job?"));

    await post("shortlist the best 5");

    const secondCall = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
      messages: Array<{ role: string; tool_calls?: Array<{ id: string; extra_content?: unknown }> }>;
    };
    const assistantTurn = secondCall.messages.find((m) => m.role === "assistant" && m.tool_calls?.length);
    expect(assistantTurn?.tool_calls?.[0]).toMatchObject({ id: "call_1", extra_content: signature });
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

  it("streams from OpenRouter with the Copilot model", async () => {
    fetchMock.mockResolvedValueOnce(textTurn("Hello."));
    const frames = await post("hi");
    const { OPENROUTER_BASE, OPENROUTER_MODELS } = await import("@/lib/ai/openRouter");
    expect(fetchMock.mock.calls[0][0]).toBe(`${OPENROUTER_BASE}/chat/completions`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ model: OPENROUTER_MODELS.copilot, stream: true });
    expect(frames.at(-2)).toEqual({ type: "text", content: "Hello." });
  });

  it("answers on the fallback model when the Copilot model fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("provider down", { status: 503 })).mockResolvedValueOnce(textTurn("Hello."));
    const frames = await post("hi");
    const { OPENROUTER_MODELS } = await import("@/lib/ai/openRouter");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).model).toBe(OPENROUTER_MODELS.copilotFallback);
    expect(frames.at(-2)).toEqual({ type: "text", content: "Hello." });
  });

  it("is unavailable without an OpenRouter key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    try {
      const { POST } = await import("@/app/api/ai/copilot/chat/route");
      const res = await POST(
        new NextRequest("http://localhost/api/ai/copilot/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
        }),
      );
      expect(res.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.env.OPENROUTER_API_KEY = "test-key";
    }
  });

  it("takes back a reply that points at a confirmation card no tool made, and asks the model again", async () => {
    // 2026-10-21: "mark that task as in progress" got "A confirmation card has
    // been shown…" with no tool call — the model copying an earlier turn.
    fetchMock
      .mockResolvedValueOnce(textTurn("A confirmation card has been shown for updating the task. Please confirm it in the UI."))
      .mockResolvedValueOnce(textTurn("Which task do you mean? I couldn't find one called that."));

    const frames = await post("mark that task as in progress");

    expect(frames).toContainEqual({ type: "retract" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { messages: Array<{ role: string; content: string }> };
    expect(retry.messages.at(-1)).toMatchObject({ role: "user", content: expect.stringContaining("no confirmation card exists") });
    expect(frames.filter((f) => f.type === "text")).toEqual([{ type: "text", content: "Which task do you mean? I couldn't find one called that." }]);
  });

  it("lets a reply speak of the card when this turn really made one", async () => {
    mockPreview.mockResolvedValueOnce({ summary: "Shortlist 5", resolvedArgs: { jobId: JOB_ID, count: 5 } });
    fetchMock.mockResolvedValueOnce(toolCallTurn({ count: 5 })).mockResolvedValueOnce(textTurn("A confirmation card is shown — confirm it to shortlist."));

    const frames = await post("shortlist the best 5");

    expect(frames.some((f) => f.type === "retract")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
