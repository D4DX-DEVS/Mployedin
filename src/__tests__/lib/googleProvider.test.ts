/**
 * Guards for the Gemini API provider (replaced Muse AI and OpenRouter, 2026-09-16).
 *
 * What these protect: one key (`GEMINI_API_KEY`), the cheapest text model as the
 * default, thinking off unless a surface opts in, the embedding model the Atlas
 * index was built with, and no trace of the two previous providers anywhere in
 * the AI code — a stale `openrouter.ai` or `api.meta.ai` URL would fail only at
 * runtime, against a key that no longer exists.
 */

import fs from "node:fs";
import path from "node:path";

import {
  GOOGLE_AI_MODELS,
  GOOGLE_AI_OPENAI_BASE,
  getGoogleAiApiKey,
  hasGoogleAiApiKey,
  chatReasoningEffort,
  copilotReasoningEffort,
  textReasoningEffort,
  parseReasoningEffort,
  completionBudget,
  nativeThinkingConfig,
  providerErrorMessage,
} from "@/lib/ai/googleAI";
import { GEMINI_MODELS } from "@/lib/ai/gemini";
import { SMALL_MODEL, LARGE_MODEL } from "@/lib/ai/copilot/modelRouter";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai/embeddings";

const ROOT = process.cwd();
const SCAN_TARGETS = [
  path.join(ROOT, "src", "lib", "ai"),
  path.join(ROOT, "src", "app", "api", "ai"),
  path.join(ROOT, "src", "lib", "security", "headers.ts"),
  path.join(ROOT, "scripts", "translate-missing.mjs"),
];
const RETIRED_PROVIDER_MARKERS = ["openrouter.ai", "api.meta.ai", "OPENROUTER_API_KEY", "MUSE_API_KEY", "@/lib/ai/muse"];

function listFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(target, entry.name);
    return entry.isDirectory() ? listFiles(full) : /\.(ts|tsx|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe("Gemini model table", () => {
  it("defaults every text alias to the cheapest reachable Gemini and the smart alias to 3.8 Flash", () => {
    // Not 2.5: Google returns 404 "no longer available to new users" for it on
    // this project (verified live 2026-09-16).
    expect(GOOGLE_AI_MODELS.text).toBe("gemini-3.1-flash-lite");
    expect(GOOGLE_AI_MODELS.smart).toBe("gemini-3.8-flash");
    expect(GEMINI_MODELS.flash).toBe(GOOGLE_AI_MODELS.text);
    expect(GEMINI_MODELS.flashLite).toBe(GOOGLE_AI_MODELS.text);
    expect(GEMINI_MODELS.pro).toBe(GOOGLE_AI_MODELS.smart);
    expect(GEMINI_MODELS.gpt).toBe(GOOGLE_AI_MODELS.smart);
  });

  it("keeps Copilot on Gemini models", () => {
    expect(SMALL_MODEL).toBe(GOOGLE_AI_MODELS.text);
    expect(LARGE_MODEL).toBe(GOOGLE_AI_MODELS.smart);
  });

  it("keeps the embedding model the Atlas index was built with", () => {
    expect(GOOGLE_AI_MODELS.embedding).toBe("gemini-embedding-001");
    expect(EMBEDDING_DIMENSIONS).toBe(3072);
  });

  it("uses Google's OpenAI-compatible surface for chat and embeddings", () => {
    expect(GOOGLE_AI_OPENAI_BASE).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
  });
});

describe("Gemini API key resolution", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("reads GEMINI_API_KEY and throws a named error when it is missing", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    expect(hasGoogleAiApiKey()).toBe(false);
    expect(() => getGoogleAiApiKey()).toThrow(/GEMINI_API_KEY/);

    process.env.GEMINI_API_KEY = "ours";
    expect(hasGoogleAiApiKey()).toBe(true);
    expect(getGoogleAiApiKey()).toBe("ours");
  });

  it("names the key in the 401 copy so the fix is obvious", () => {
    expect(providerErrorMessage(401, "")).toMatch(/GEMINI_API_KEY/);
    expect(providerErrorMessage(429, "")).toMatch(/rate limit/i);
  });
});

describe("Thinking defaults", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("sends reasoning_effort none on every surface unless env opts in", () => {
    delete process.env.GEMINI_CHAT_REASONING_EFFORT;
    delete process.env.GEMINI_COPILOT_REASONING_EFFORT;
    delete process.env.GEMINI_TEXT_REASONING_EFFORT;
    expect(chatReasoningEffort()).toBe("none");
    expect(copilotReasoningEffort()).toBe("none");
    expect(textReasoningEffort()).toBe("none");

    process.env.GEMINI_COPILOT_REASONING_EFFORT = "low";
    expect(copilotReasoningEffort()).toBe("low");
    expect(parseReasoningEffort("turbo", "none")).toBe("none");
  });

  it("adds thinking headroom to max_tokens only when thinking is on", () => {
    // With thinking on, the budget is shared and an answer-sized limit can be
    // consumed entirely by reasoning (Muse returned empty 200s that way).
    expect(completionBudget(2000, "none")).toBe(2000);
    expect(completionBudget(2000, "low")).toBeGreaterThan(2000);
  });

  it("disables thinking on the native API for the 2.5 family only", () => {
    expect(nativeThinkingConfig("gemini-2.5-flash", "none")).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
    expect(nativeThinkingConfig("gemini-2.5-flash", "low")).toEqual({});
    expect(nativeThinkingConfig("gemini-3.1-flash-lite", "none")).toEqual({});
  });
});

describe("Retired providers", () => {
  it("leaves no OpenRouter or Muse reference in the AI code, CSP or scripts", () => {
    const offenders: string[] = [];
    for (const target of SCAN_TARGETS) {
      for (const file of listFiles(target)) {
        const source = fs.readFileSync(file, "utf8");
        for (const marker of RETIRED_PROVIDER_MARKERS) {
          if (source.includes(marker)) offenders.push(`${path.relative(ROOT, file)} → ${marker}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no muse.ts left to import", () => {
    expect(fs.existsSync(path.join(ROOT, "src", "lib", "ai", "muse.ts"))).toBe(false);
  });
});

describe("Gemini image generation", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  it("calls native generateContent with an IMAGE modality and unwraps inlineData", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Here you go" }, { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1290, totalTokenCount: 1300 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { generateImage } = await import("@/lib/ai/openai");
    const result = await generateImage({ prompt: "a hiring poster", size: "1024x1536" });

    expect(result.b64).toBe("aGVsbG8=");
    expect(result.mimeType).toBe("image/png");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/models/${GOOGLE_AI_MODELS.image}:generateContent`);
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "test-key" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.generationConfig.responseModalities).toEqual(["IMAGE"]);
    // Portrait poster → 2:3; the caller's "size" was always an aspect ratio, never pixels.
    expect(body.generationConfig.imageConfig.aspectRatio).toBe("2:3");
    expect(body.contents[0].parts[0].text).toBe("a hiring poster");
  });

  it("surfaces a rejected key as actionable copy", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "API key not valid",
    }) as unknown as typeof fetch;

    const { generateImage } = await import("@/lib/ai/openai");
    await expect(generateImage({ prompt: "x" })).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("fails loudly when the model returns text but no image", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "I cannot draw that" }] }, finishReason: "STOP" }] }),
    }) as unknown as typeof fetch;

    const { generateImage } = await import("@/lib/ai/openai");
    await expect(generateImage({ prompt: "x" })).rejects.toThrow(/no image/i);
  });
});
