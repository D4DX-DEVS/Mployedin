/**
 * @jest-environment node
 *
 * CVs and profiles go through OpenRouter, and qwen/qwen3.7-flash has a single
 * provider (Alibaba Cloud). Every chat call asks for providers that neither
 * store nor train on prompts, so OpenRouter refuses a call rather than quietly
 * routing it somewhere that keeps the data. Verified live 2026-10-15: Qwen
 * answers with this set (200 in 551 ms).
 */

const providerFetch = jest.fn();
jest.mock("@/lib/ai/providerFetch", () => ({
  providerFetch: (...args: unknown[]) => providerFetch(...args),
}));

import { openRouterChatFetch } from "@/lib/ai/openRouter";

const BODY = { model: "gemini-3.1-flash-lite", messages: [{ role: "user", content: "hi" }] };

function sentBody(call: number): Record<string, unknown> {
  const init = providerFetch.mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  providerFetch.mockReset();
  process.env.OPENROUTER_API_KEY = "or-test-key";
});

describe("openRouterChatFetch data policy", () => {
  it("asks for no data collection on a standard call", async () => {
    providerFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await openRouterChatFetch(BODY, "chat");
    expect(sentBody(0).provider).toEqual({ data_collection: "deny" });
  });

  it("keeps it on both the flex attempt and the standard retry", async () => {
    providerFetch
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await openRouterChatFetch(BODY, "bg", undefined, { tier: "flex" });
    expect(sentBody(0).provider).toEqual({ data_collection: "deny" });
    expect(sentBody(1).provider).toEqual({ data_collection: "deny" });
  });

  it("keeps a caller's own provider preferences, but never lets them allow collection", async () => {
    providerFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await openRouterChatFetch({ ...BODY, provider: { order: ["alibaba"], data_collection: "allow" } }, "chat");
    expect(sentBody(0).provider).toEqual({ order: ["alibaba"], data_collection: "deny" });
  });
});
