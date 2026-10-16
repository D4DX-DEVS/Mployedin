/**
 * @jest-environment node
 */
import { AiTimeoutError, readJsonWithin } from "@/lib/ai/providerFetch";

/** Headers arrive at once; the body never does. */
const stalled = () => new Response(new ReadableStream({ start() {} }), { status: 200 });

describe("readJsonWithin", () => {
  it("rejects with AiTimeoutError when the body never finishes", async () => {
    await expect(readJsonWithin(stalled(), "test", 30)).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it("returns the parsed body when it arrives in time", async () => {
    await expect(readJsonWithin(new Response('{"a":1}'), "test", 1000)).resolves.toEqual({ a: 1 });
  });
});

describe("decide", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, OPENROUTER_API_KEY: "test-key", JEV_TIMEOUT_MS: "50" };
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns null within the decision budget when the body stalls", async () => {
    global.fetch = jest.fn(async () => stalled()) as unknown as typeof fetch;
    const { decide } = await import("@/lib/ai/jev");
    const started = Date.now();
    const result = await decide(
      { x: 1 },
      { q: { type: "noul", instructions: "i", criteria: { true: "t", false: "f" } } },
    );
    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
