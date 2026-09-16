/**
 * @jest-environment node
 *
 * A stalled AI provider (expired key, dead model, provider incident) used to
 * hang the route until the hosting gateway answered 504 — past the app, past
 * its own graceful 503 path, with a worker pinned the whole time. Every
 * provider call now runs under an abort timer.
 */
import { providerFetch, AiTimeoutError, AI_REQUEST_TIMEOUT_MS } from "@/lib/ai/providerFetch";

jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

describe("providerFetch", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.useRealTimers(); });

  it("aborts and throws AiTimeoutError when the provider never answers", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as unknown as typeof fetch;

    const pending = providerFetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST" }, "test", 5000);
    const assertion = expect(pending).rejects.toBeInstanceOf(AiTimeoutError);
    jest.advanceTimersByTime(5000);
    await assertion;
  });

  it("passes an abort signal on every call", async () => {
    const spy = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("{}", { status: 200 });
    });
    global.fetch = spy as unknown as typeof fetch;
    const res = await providerFetch("https://openrouter.ai/api/v1/embeddings", { method: "POST" }, "test");
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("lets a real provider error through untouched", async () => {
    global.fetch = jest.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    await expect(providerFetch("https://openrouter.ai", {}, "test")).rejects.toThrow("ECONNREFUSED");
  });

  it("defaults to a bounded timeout rather than waiting forever", () => {
    expect(AI_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(AI_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60000);
  });
});
