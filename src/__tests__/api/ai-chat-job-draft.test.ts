/**
 * @jest-environment node
 *
 * The AI job creator chat sends the draft on screen (and the poster's text)
 * with each message; the route puts them in the system prompt so "add the
 * qualification" edits that draft instead of asking which job (2026-11-09).
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "u1", role: "agent" } }),
}));
jest.mock("@/lib/subscription/featureGate", () => ({ enforceFeatureGate: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }),
  RATE_LIMIT_CONFIGS: { ai: {} },
}));
jest.mock("@/lib/ai/dailyQuota", () => ({ enforceDailyAiQuota: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
// The recent-activity lookup every assistant context makes.
jest.mock("@/models/AuditLog", () => {
  const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => [] };
  return { __esModule: true, default: { find: () => chain } };
});
const providerFetch = jest.fn();
jest.mock("@/lib/ai/providerFetch", () => ({
  providerFetch: (...args: unknown[]) => providerFetch(...args),
}));

import { POST } from "@/app/api/ai/chat/route";

const SSE = 'data: {"choices":[{"delta":{"content":"Done"}}]}\n\ndata: [DONE]\n\n';
const saved = { ...process.env };

function ask(extra: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "add the qualification" }], context: "job_creator", ...extra }),
  });
}

function systemPrompt(): string {
  const [, init] = providerFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string).messages[0].content as string;
}

beforeEach(() => {
  providerFetch.mockReset();
  providerFetch.mockImplementation(() => Promise.resolve(new Response(SSE, { status: 200 })));
  process.env = { ...saved, OPENROUTER_API_KEY: "or-test-key" };
  delete process.env.AI_TEXT_PROVIDER;
});

afterAll(() => {
  process.env = { ...saved };
});

describe("/api/ai/chat job creator draft", () => {
  it("puts the draft on screen and the poster's text into the system prompt", async () => {
    const res = await POST(ask({ jobDraft: { title: "Operations Head" }, posterText: "Qualification: Any degree" }));
    expect(res.status).toBe(200);
    const prompt = systemPrompt();
    expect(prompt).toContain("=== BEGIN CURRENT DRAFT ===");
    expect(prompt).toContain('"title":"Operations Head"');
    expect(prompt).toContain("Qualification: Any degree");
  });

  it("refuses an oversized draft before calling the model", async () => {
    const res = await POST(ask({ jobDraft: { description: "x".repeat(31_000) } }));
    expect(res.status).toBe(400);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("adds no draft section to a conversation that has no draft yet", async () => {
    await POST(ask({}));
    expect(systemPrompt()).not.toContain("=== BEGIN CURRENT DRAFT ===");
  });

  it("ignores a draft sent with any other assistant context", async () => {
    await POST(ask({ context: "agent_assist", jobDraft: { title: "Operations Head" } }));
    expect(systemPrompt()).not.toContain("=== BEGIN CURRENT DRAFT ===");
  });
});
