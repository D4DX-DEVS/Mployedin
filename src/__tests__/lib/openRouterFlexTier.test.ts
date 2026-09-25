/**
 * @jest-environment node
 *
 * Background AI calls go to Gemini's flex tier on OpenRouter — the same model at
 * half the price ($0.125 / $0.75 per 1M vs $0.25 / $1.50 for
 * gemini-3.1-flash-lite, per the endpoints API on 2026-09-24).
 *
 * The catch is in OpenRouter's own docs: "Flex never falls back to a
 * default-tier endpoint … a flex capacity error surfaces instead." So the
 * fallback is ours: a capacity failure retries once on the default tier, and
 * nothing interactive ever asks for flex in the first place.
 */

const providerFetch = jest.fn();
jest.mock("@/lib/ai/providerFetch", () => ({
  providerFetch: (...args: unknown[]) => providerFetch(...args),
}));

import { openRouterChatFetch, FLEX_TIMEOUT_MS } from "@/lib/ai/openRouter";

function sentBody(call: number): Record<string, unknown> {
  const init = providerFetch.mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string);
}

const BODY = { model: "gemini-3.1-flash-lite", messages: [{ role: "user", content: "hi" }] };

beforeEach(() => {
  providerFetch.mockReset();
});

describe("openRouterChatFetch service tiers", () => {
  it("never asks for a tier by default — interactive calls stay on the standard tier", async () => {
    providerFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await openRouterChatFetch(BODY, "chat");
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect(sentBody(0)).not.toHaveProperty("service_tier");
  });

  it("asks for flex when the caller opts in, and does not retry a success", async () => {
    providerFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await openRouterChatFetch(BODY, "bg", undefined, { tier: "flex" });
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect(sentBody(0)).toMatchObject({ service_tier: "flex", model: "google/gemini-3.1-flash-lite" });
  });

  it("gives the flex attempt a longer timeout — it took 16.7 s live, near the 20 s default", async () => {
    providerFetch
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await openRouterChatFetch(BODY, "bg", undefined, { tier: "flex" });
    expect(providerFetch.mock.calls[0][3]).toBe(FLEX_TIMEOUT_MS);
    // The standard-tier retry goes back to the caller's own budget.
    expect(providerFetch.mock.calls[1][3]).toBeUndefined();
  });

  it.each([429, 502, 503, 529])("falls back to the standard tier on a flex capacity error (%i)", async (status) => {
    providerFetch
      .mockResolvedValueOnce(new Response("no flex capacity", { status }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await openRouterChatFetch(BODY, "bg", undefined, { tier: "flex" });
    expect(res.status).toBe(200);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(sentBody(1)).not.toHaveProperty("service_tier");
  });

  it("falls back when the flex request times out", async () => {
    providerFetch
      .mockRejectedValueOnce(new Error("AI provider request timed out after 20000ms (bg)"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await openRouterChatFetch(BODY, "bg", undefined, { tier: "flex" });
    expect(res.status).toBe(200);
    expect(sentBody(1)).not.toHaveProperty("service_tier");
  });

  it.each([400, 401, 402, 403])("does not retry a request error the standard tier would repeat (%i)", async (status) => {
    providerFetch.mockResolvedValue(new Response("bad", { status }));
    const res = await openRouterChatFetch(BODY, "bg", undefined, { tier: "flex" });
    expect(res.status).toBe(status);
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });
});
