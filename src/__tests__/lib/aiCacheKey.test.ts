/**
 * @jest-environment node
 */

const findOne = jest.fn();
const create = jest.fn();
const deleteOne = jest.fn();
jest.mock("@/models/AICache", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => findOne(...a),
    create: (...a: unknown[]) => create(...a),
    deleteOne: (...a: unknown[]) => deleteOne(...a),
  },
  CACHE_TTL_SEC: { chat: 60, report: 60, cv_extract: 60, job_match: 60, skills_gap: 60, job_description: 60, nl_search: 60 },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
const generateText = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  GEMINI_MODELS: { flash: "gemini-3.1-flash-lite", pro: "gemini-3.8-flash" },
  generateText: (...a: unknown[]) => generateText(...a),
  generateStream: jest.fn(),
}));

import { routeGenerate, invalidateAICache } from "@/lib/ai/router";

const saved = { ...process.env };
const hashOf = (call: number) => (findOne.mock.calls[call][0] as { hash: string }).hash;

beforeEach(() => {
  jest.clearAllMocks();
  findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  create.mockResolvedValue({});
  deleteOne.mockResolvedValue({});
  generateText.mockResolvedValue("answer");
  process.env = { ...saved, OPENROUTER_API_KEY: "or-test-key", OPENROUTER_TEXT_MODEL: "google/gemini-3.1-flash-lite" };
  delete process.env.AI_TEXT_PROVIDER;
});

afterAll(() => {
  process.env = { ...saved };
});

describe("AI cache key", () => {
  it("is stable for the same task, prompt and model", async () => {
    await routeGenerate("Summarise this job", "chat");
    await routeGenerate("Summarise this job", "chat");
    expect(hashOf(0)).toBe(hashOf(1));
  });

  it("changes when the serving model changes, so a switch never serves the old model's answer", async () => {
    await routeGenerate("Summarise this job", "chat");
    process.env.OPENROUTER_TEXT_MODEL = "qwen/qwen3.7-flash";
    await routeGenerate("Summarise this job", "chat");
    expect(hashOf(0)).not.toBe(hashOf(1));
  });

  it("invalidates the same key it reads", async () => {
    await routeGenerate("Quarterly report", "report");
    await invalidateAICache("report", "Quarterly report");
    expect(deleteOne).toHaveBeenCalledWith({ hash: hashOf(0) });
  });
});
