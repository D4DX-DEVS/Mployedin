/**
 * @jest-environment node
 */
import { computeCost, priceFor } from "@/lib/ai/pricing";
import {
  extractUsage,
  extractUsageFromSse,
  modelFromRequest,
  providerFromUrl,
} from "@/lib/ai/usageLog";
import { featureFromPath, getAiCaller, runWithAiCaller, tagAiEmployer } from "@/lib/ai/usageContext";

describe("computeCost", () => {
  test("prefers the provider's reported cost", () => {
    expect(computeCost({ model: "x/unknown", inputTokens: 10, outputTokens: 10, reportedCostUsd: 0.0042 })).toEqual({
      costUsd: 0.0042,
      priced: true,
    });
  });

  test("prices a known model per million tokens", () => {
    const r = computeCost({ model: "google/gemini-3.1-flash-lite", inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(r.priced).toBe(true);
    expect(r.costUsd).toBeCloseTo(1.75, 6);
  });

  test("reports an unknown model as unpriced, not free", () => {
    expect(computeCost({ model: "acme/mystery", inputTokens: 500, outputTokens: 500 })).toEqual({
      costUsd: 0,
      priced: false,
    });
  });

  test("matches a model id with a variant suffix", () => {
    expect(priceFor("google/gemini-3.1-flash-lite:flex")).toBeDefined();
  });
});

describe("extractUsage", () => {
  test("reads OpenAI-style usage with OpenRouter cost", () => {
    expect(
      extractUsage({ model: "qwen/qwen3.7-flash", usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.0003 } }),
    ).toEqual({ inputTokens: 120, outputTokens: 30, costUsd: 0.0003, model: "qwen/qwen3.7-flash" });
  });

  test("reads native Google usageMetadata", () => {
    expect(
      extractUsage({ modelVersion: "gemini-x", usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20, thoughtsTokenCount: 5 } }),
    ).toMatchObject({ inputTokens: 50, outputTokens: 25, model: "gemini-x" });
  });

  test("returns null when there is no usage", () => {
    expect(extractUsage({ choices: [] })).toBeNull();
    expect(extractUsage(null)).toBeNull();
  });

  test("takes the last usage in an SSE stream", () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"hi"}}]}',
      'data: {"usage":{"prompt_tokens":7,"completion_tokens":3}}',
      "data: [DONE]",
    ].join("\n");
    expect(extractUsageFromSse(sse)).toMatchObject({ inputTokens: 7, outputTokens: 3 });
  });
});

describe("request helpers", () => {
  test("provider from url", () => {
    expect(providerFromUrl("https://openrouter.ai/api/v1/chat/completions")).toBe("openrouter");
    expect(providerFromUrl("https://generativelanguage.googleapis.com/v1beta/x")).toBe("google");
  });

  test("model from body, then from native url", () => {
    expect(modelFromRequest("https://x", JSON.stringify({ model: "m1" }))).toBe("m1");
    expect(modelFromRequest("https://g/v1beta/models/gemini-9:generateContent", undefined)).toBe("gemini-9");
  });
});

describe("usage context", () => {
  test("is visible inside the run and gone outside it", () => {
    expect(getAiCaller()).toBeUndefined();
    runWithAiCaller({ role: "agent", userId: "u1" }, () => {
      expect(getAiCaller()?.role).toBe("agent");
    });
    expect(getAiCaller()).toBeUndefined();
  });

  test("a route can tag the employer it is working for", () => {
    runWithAiCaller({ role: "agent", userId: "u1" }, () => {
      tagAiEmployer("emp1");
      expect(getAiCaller()).toMatchObject({ employerId: "emp1", onBehalf: true });
    });
  });

  test("maps request paths to features", () => {
    expect(featureFromPath("/api/ai/job-assist")).toBe("job_assistant");
    expect(featureFromPath("/api/ai/cv-extract")).toBe("cv_reading");
    expect(featureFromPath("/api/ai/poster-generate")).toBe("poster");
    expect(featureFromPath("/api/ai/report")).toBe("market_report");
    expect(featureFromPath("/api/jobs")).toBe("other");
  });
});
