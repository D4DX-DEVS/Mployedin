/**
 * @jest-environment node
 *
 * Copilot runs on the text model (Qwen 3.7 Flash) and falls back to Gemini
 * when it fails: Qwen has one provider on OpenRouter, so an Alibaba outage
 * would otherwise take Copilot down with it. Both can be pinned from env.
 */
import { OPENROUTER_MODELS } from "@/lib/ai/openRouter";

const KEYS = ["OPENROUTER_TEXT_MODEL", "OPENROUTER_COPILOT_MODEL", "OPENROUTER_COPILOT_FALLBACK_MODEL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Copilot models", () => {
  it("uses the text model by default", () => {
    expect(OPENROUTER_MODELS.copilot).toBe(OPENROUTER_MODELS.text);
    process.env.OPENROUTER_TEXT_MODEL = "some/text-model";
    expect(OPENROUTER_MODELS.copilot).toBe("some/text-model");
  });

  it("can be pinned on its own", () => {
    process.env.OPENROUTER_COPILOT_MODEL = "google/gemini-3.1-flash-lite";
    expect(OPENROUTER_MODELS.copilot).toBe("google/gemini-3.1-flash-lite");
  });

  it("falls back to Gemini, on a different provider than Qwen", () => {
    expect(OPENROUTER_MODELS.copilotFallback).toBe("google/gemini-3.1-flash-lite");
    process.env.OPENROUTER_COPILOT_FALLBACK_MODEL = "other/model";
    expect(OPENROUTER_MODELS.copilotFallback).toBe("other/model");
  });
});
