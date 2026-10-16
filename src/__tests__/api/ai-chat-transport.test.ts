/**
 * @jest-environment node
 *
 * /api/ai/chat used to fetch Google directly: no timeout, and it ignored the
 * OpenRouter switch every other AI call follows. It now goes through
 * chatCompletionsFetch like the rest. An employer with no assistant context
 * keeps the route away from the database, so only the transport is exercised.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "u1", role: "employer" } }),
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
const providerFetch = jest.fn();
jest.mock("@/lib/ai/providerFetch", () => ({
  providerFetch: (...args: unknown[]) => providerFetch(...args),
}));

import { POST } from "@/app/api/ai/chat/route";
import { OPENROUTER_MODELS } from "@/lib/ai/openRouter";

const SSE = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n';
const saved = { ...process.env };

function ask() {
  return new NextRequest("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
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

describe("/api/ai/chat transport", () => {
  it("streams through OpenRouter with the text model and the no-retention policy", async () => {
    const res = await POST(ask());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello");
    const [url, init] = providerFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: OPENROUTER_MODELS.text, stream: true, reasoning_effort: "none" });
    expect(body.provider).toEqual({ data_collection: "deny" });
  });

  it("still reaches Google when text is forced back to Google", async () => {
    process.env.AI_TEXT_PROVIDER = "google";
    process.env.GEMINI_API_KEY = "g-test-key";
    await POST(ask());

    const [url] = providerFetch.mock.calls[0] as [string];
    expect(url).toContain("generativelanguage.googleapis.com");
  });

  it("answers 503 without calling anyone when the serving provider has no key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    const res = await POST(ask());

    expect(res.status).toBe(503);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
