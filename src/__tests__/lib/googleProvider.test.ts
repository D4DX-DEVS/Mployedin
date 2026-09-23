/**
 * Guards for the AI provider split.
 *
 * History: OpenRouter -> Muse AI (one day) -> Gemini direct (2026-09-16) ->
 * OpenRouter for text, Gemini direct for embeddings (2026-09-22).
 *
 * The current arrangement is deliberate and easy to undo by accident:
 *   - TEXT goes to OpenRouter, because Google answers 404 for the 2.5 family
 *     on this project and 2.5-flash-lite is 2.5x cheaper than what we can
 *     reach directly.
 *   - EMBEDDINGS stay on Google, because OpenRouter sells none and the Atlas
 *     vector index is built on gemini-embedding-001 at 3072 dimensions.
 *     Pointing embeddings anywhere else silently produces vectors that cannot
 *     be compared with the ones already stored.
 *   - Image generation is a native generateContent call and Google-only.
 *   - CV / job-poster extraction (PDF and image input) follows the text
 *     provider: OpenRouter's Gemini by default, Google's native API only when
 *     AI_TEXT_PROVIDER=google.
 *
 * Muse remains retired; a stale `api.meta.ai` URL would fail only at runtime,
 * against a key that no longer exists.
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
import {
  OPENROUTER_MODELS,
  isOpenRouterTextProvider,
  toOpenRouterModel,
  isPastTextSunset,
} from "@/lib/ai/openRouter";

const ROOT = process.cwd();
const SCAN_TARGETS = [
  path.join(ROOT, "src", "lib", "ai"),
  path.join(ROOT, "src", "app", "api", "ai"),
  path.join(ROOT, "src", "lib", "security", "headers.ts"),
  path.join(ROOT, "scripts", "translate-missing.mjs"),
];
// OpenRouter is a supported provider again as of 2026-09-22, so its URL and
// key are no longer offenders. Muse is still gone for good.
const RETIRED_PROVIDER_MARKERS = ["api.meta.ai", "MUSE_API_KEY", "@/lib/ai/muse"];

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

  it("names the right key in the 401 copy so the fix is obvious", () => {
    // Which key to check depends on which provider answered. Getting this
    // wrong sends whoever is debugging to the wrong dashboard.
    expect(providerErrorMessage(401, "", "request", "google")).toMatch(/GEMINI_API_KEY/);
    expect(providerErrorMessage(401, "", "request", "openrouter")).toMatch(/OPENROUTER_API_KEY/);
    expect(providerErrorMessage(429, "", "request", "google")).toMatch(/rate limit/i);
    expect(providerErrorMessage(429, "", "request", "openrouter")).toMatch(/rate limit/i);
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

describe("Provider split", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("keeps embeddings on Google — OpenRouter sells none", () => {
    // The Atlas index is 3072-dim gemini-embedding-001. Routing embeddings
    // anywhere else yields vectors that cannot be compared with the stored
    // ones, and the failure is silent: cosines just become meaningless.
    const source = fs.readFileSync(path.join(ROOT, "src", "lib", "ai", "embeddings.ts"), "utf8");
    expect(source).toContain("GOOGLE_AI_OPENAI_BASE");
    expect(source).not.toContain("openRouter");
    expect(source).not.toContain("OPENROUTER");
    expect(EMBEDDING_DIMENSIONS).toBe(3072);
    expect(GOOGLE_AI_MODELS.embedding).toBe("gemini-embedding-001");
  });

  it("routes text to OpenRouter when a key is present, and honours the override", () => {
    process.env.OPENROUTER_API_KEY = "k";
    delete process.env.AI_TEXT_PROVIDER;
    expect(isOpenRouterTextProvider()).toBe(true);

    // One env var reverts the whole thing without a deploy.
    process.env.AI_TEXT_PROVIDER = "google";
    expect(isOpenRouterTextProvider()).toBe(false);

    process.env.AI_TEXT_PROVIDER = "openrouter";
    expect(isOpenRouterTextProvider()).toBe(true);

    delete process.env.AI_TEXT_PROVIDER;
    delete process.env.OPENROUTER_API_KEY;
    expect(isOpenRouterTextProvider()).toBe(false);
  });

  it("translates Google model ids at the transport boundary only", () => {
    // ~20 routes index into GEMINI_MODELS by logical name. Rather than touch
    // them all, the id is mapped here — so the mapping must cover both tiers.
    process.env.GEMINI_SMART_MODEL = "gemini-3.8-flash";
    expect(toOpenRouterModel("gemini-3.8-flash")).toBe(OPENROUTER_MODELS.smart);
    expect(toOpenRouterModel("gemini-3.1-flash-lite")).toBe(OPENROUTER_MODELS.text);
    // An already-namespaced id is an explicit override and passes through.
    expect(toOpenRouterModel("x-ai/grok-4.7")).toBe("x-ai/grok-4.7");
  });

  it("points the decision model at Jev", () => {
    expect(OPENROUTER_MODELS.decision).toContain("jev");
  });

  it("defaults to models that are not scheduled for retirement", () => {
    // 2.5-flash-lite was the default until 2026-09-22. Two things moved us:
    // OpenRouter retires the whole 2.5 family on 2026-10-20, and a benchmark on
    // this codebase's own extraction prompt showed 2.5 inventing skills off the
    // job title (45% of what it returned was supported by the text it read,
    // against 100% for 3.1-flash-lite). Skills are 60% of the relevance score,
    // so an invented one is not a cosmetic problem.
    delete process.env.OPENROUTER_TEXT_MODEL;
    delete process.env.OPENROUTER_SMART_MODEL;
    expect(OPENROUTER_MODELS.text).toBe("google/gemini-3.1-flash-lite");
    expect(OPENROUTER_MODELS.smart).toBe("google/gemini-3.8-flash");
    expect(OPENROUTER_MODELS.text).not.toContain("2.5");
    expect(OPENROUTER_MODELS.smart).not.toContain("2.5");
  });

  it("knows the date OpenRouter retires the 2.5 family", () => {
    expect(isPastTextSunset(new Date("2026-10-19T00:00:00Z"))).toBe(false);
    expect(isPastTextSunset(new Date("2026-10-21T00:00:00Z"))).toBe(true);
    // Read per call, not frozen at import: a server started in September must
    // not still be honouring a retired pin in November.
    expect(typeof Object.getOwnPropertyDescriptor(OPENROUTER_MODELS, "text")?.get).toBe("function");
  });

  it("honours a model override, but drops one that names a retired model", () => {
    process.env.OPENROUTER_TEXT_MODEL = "x-ai/grok-4.7";
    expect(OPENROUTER_MODELS.text).toBe("x-ai/grok-4.7");

    // A pin on 2.5 works right up until the morning it doesn't. Past the
    // sunset it is ignored rather than left to 404 inside a 06:00 cron.
    process.env.OPENROUTER_TEXT_MODEL = "google/gemini-2.5-flash-lite";
    jest.useFakeTimers().setSystemTime(new Date("2026-10-21T00:00:00Z"));
    expect(OPENROUTER_MODELS.text).toBe("google/gemini-3.1-flash-lite");
    jest.setSystemTime(new Date("2026-10-19T00:00:00Z"));
    expect(OPENROUTER_MODELS.text).toBe("google/gemini-2.5-flash-lite");
    jest.useRealTimers();

    delete process.env.OPENROUTER_TEXT_MODEL;
  });

  it("leaves no Muse reference in the AI code, CSP or scripts", () => {
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

describe("Multimodal input — CV and job-poster extraction", () => {
  const saved = { ...process.env };
  const PDF_B64 = Buffer.from("%PDF-1.4 test").toString("base64");

  beforeEach(() => {
    jest.resetModules();
    process.env.OPENROUTER_API_KEY = "or-test-key";
    process.env.GEMINI_API_KEY = "g-test-key";
    delete process.env.AI_TEXT_PROVIDER;
    delete process.env.OPENROUTER_TEXT_MODEL;
  });

  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  const okCompletion = (content: string | null, finish_reason = "stop") =>
    jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content }, finish_reason }],
        usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 },
      }),
    });

  it("sends a PDF CV to OpenRouter's Gemini as a file part, with Gemini's own reader pinned", async () => {
    const fetchMock = okCompletion('{"fullName":"Test"}');
    global.fetch = fetchMock as unknown as typeof fetch;

    const { generateMultimodal, GEMINI_MODELS } = await import("@/lib/ai/gemini");
    const text = await generateMultimodal(
      [{ text: "Extract this CV" }, { inlineData: { mimeType: "application/pdf", data: PDF_B64 } }],
      GEMINI_MODELS.flash,
      1000,
    );

    expect(text).toBe('{"fullName":"Test"}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer or-test-key" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("google/gemini-3.1-flash-lite");
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Extract this CV" },
      { type: "file", file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${PDF_B64}` } },
    ]);
    // Named, not inferred: without it OpenRouter may fall back to paid OCR.
    expect(body.plugins).toEqual([{ id: "file-parser", pdf: { engine: "native" } }]);
    expect(body.reasoning_effort).toBe("none");
    expect(body.max_tokens).toBe(1000);
  });

  it("sends an image CV as image_url, with no PDF parser", async () => {
    const fetchMock = okCompletion("{}");
    global.fetch = fetchMock as unknown as typeof fetch;

    const { generateMultimodal } = await import("@/lib/ai/gemini");
    await generateMultimodal([{ text: "Extract" }, { inlineData: { mimeType: "image/png", data: "aGk=" } }]);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,aGk=" } });
    expect(body.plugins).toBeUndefined();
  });

  it("falls back to Google's native API when text is forced back to Google", async () => {
    process.env.AI_TEXT_PROVIDER = "google";
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { generateMultimodal } = await import("@/lib/ai/gemini");
    await generateMultimodal([{ text: "Extract" }, { inlineData: { mimeType: "application/pdf", data: PDF_B64 } }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(":generateContent");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "application/pdf", data: PDF_B64 } });
  });

  it("names the OpenRouter key when OpenRouter rejects it", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "No auth credentials found",
    }) as unknown as typeof fetch;

    const { generateMultimodal } = await import("@/lib/ai/gemini");
    await expect(
      generateMultimodal([{ inlineData: { mimeType: "application/pdf", data: PDF_B64 } }]),
    ).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("fails loudly on an empty answer instead of handing the route an empty string", async () => {
    global.fetch = okCompletion(null, "content_filter") as unknown as typeof fetch;

    const { generateMultimodal } = await import("@/lib/ai/gemini");
    await expect(
      generateMultimodal([{ inlineData: { mimeType: "application/pdf", data: PDF_B64 } }]),
    ).rejects.toThrow(/no text \(content_filter\)/);
  });
});
