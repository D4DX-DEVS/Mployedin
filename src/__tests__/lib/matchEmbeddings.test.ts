/**
 * @jest-environment node
 *
 * refreshMatchEmbeddings re-embeds only documents whose match text changed,
 * writes with timestamps off (so the write is not itself a "change" the next
 * sweep picks up), and gives a job with no skills its AI skills first.
 */
const embedForMatching = jest.fn();
jest.mock("@/lib/ai/openRouterEmbeddings", () => ({
  ...jest.requireActual("@/lib/ai/openRouterEmbeddings"),
  embedForMatching: (...a: unknown[]) => embedForMatching(...a),
}));
const extractJobSkills = jest.fn();
jest.mock("@/lib/matching/jobSkillExtraction", () => ({
  ...jest.requireActual("@/lib/matching/jobSkillExtraction"),
  extractJobSkills: (...a: unknown[]) => extractJobSkills(...a),
}));
jest.mock("@/lib/ai/gemini", () => ({ generateText: jest.fn(), GEMINI_MODELS: {} }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));
const syncMatchVectors = jest.fn(async () => undefined);
const removeMatchVectors = jest.fn(async () => undefined);
let syncEnabled = false;
jest.mock("@/lib/matching/vectorStore", () => ({
  vectorSyncEnabled: () => syncEnabled,
  syncMatchVectors: (...a: unknown[]) => syncMatchVectors(...(a as [])),
  removeMatchVectors: (...a: unknown[]) => removeMatchVectors(...(a as [])),
}));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["select", "sort", "limit"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
let seekerDocs: Array<Record<string, unknown>> = [];
let jobDocs: Array<Record<string, unknown>> = [];
const seekerUpdate = jest.fn(async () => ({}));
const jobUpdate = jest.fn(async () => ({}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain(seekerDocs)), updateOne: (...a: unknown[]) => seekerUpdate(...(a as [])) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain(jobDocs)), updateOne: (...a: unknown[]) => jobUpdate(...(a as [])) },
}));

import { refreshMatchEmbeddings } from "@/lib/matching/matchEmbeddings";
import { seekerMatchText, jobMatchText } from "@/lib/matching/matchText";
import { MATCH_EMBEDDING_DIMS } from "@/lib/ai/openRouterEmbeddings";

const vec = () => Array.from({ length: MATCH_EMBEDDING_DIMS }, () => 0.1);

beforeEach(() => {
  jest.clearAllMocks();
  embedForMatching.mockImplementation(async (texts: string[]) => texts.map(vec));
  seekerDocs = [];
  jobDocs = [];
});

describe("refreshMatchEmbeddings", () => {
  it("hands Vectorize the new vectors and the emptied ids (VECTOR_STORE decides whether they go)", async () => {
    seekerDocs = [
      { _id: "s2", skills: ["Vue"], matchTextHash: "old" },
      { _id: "s3", matchTextHash: "old" },
    ];
    await refreshMatchEmbeddings("seeker", {}, { limit: 50 });
    expect(removeMatchVectors).toHaveBeenCalledWith("seeker", ["s3"]);
    expect(syncMatchVectors).toHaveBeenCalledWith("seeker", [{ id: "s2", values: vec() }]);
  });

  it("re-copies an unchanged document's stored vector when Vectorize is kept in step (a reopened job)", async () => {
    const doc = { _id: "s1", skills: ["React"] };
    seekerDocs = [{ ...doc, matchTextHash: seekerMatchText(doc).hash, matchEmbedding: vec(), matchEmbeddingModel: "qwen/qwen3-embedding-8b" }];
    await refreshMatchEmbeddings("seeker", {}, { limit: 50 });
    expect(syncMatchVectors).not.toHaveBeenCalled();

    syncEnabled = true;
    await refreshMatchEmbeddings("seeker", {}, { limit: 50 });
    expect(syncMatchVectors).toHaveBeenCalledWith("seeker", [{ id: "s1", values: vec() }]);
    expect(embedForMatching).not.toHaveBeenCalled();
    syncEnabled = false;
  });

  it("touches Vectorize with nothing on a dry run", async () => {
    seekerDocs = [{ _id: "s2", skills: ["Vue"], matchTextHash: "old" }];
    await refreshMatchEmbeddings("seeker", {}, { limit: 50, dryRun: true });
    expect(syncMatchVectors).not.toHaveBeenCalled();
    expect(removeMatchVectors).toHaveBeenCalledWith("seeker", []);
  });

  it("embeds changed seekers and skips the ones whose text is unchanged", async () => {
    const unchanged = { _id: "s1", skills: ["React"] };
    seekerDocs = [
      { ...unchanged, matchTextHash: seekerMatchText(unchanged).hash },
      { _id: "s2", skills: ["Vue"], matchTextHash: "old" },
    ];
    const out = await refreshMatchEmbeddings("seeker", {}, { limit: 50 });

    expect(out).toEqual({ scanned: 2, embedded: 1, unchanged: 1, emptied: 0, skillsExtracted: 0 });
    expect(embedForMatching).toHaveBeenCalledWith([seekerMatchText({ skills: ["Vue"] }).text]);
    expect(seekerUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = seekerUpdate.mock.calls[0] as unknown as [unknown, { $set: Record<string, unknown> }, unknown];
    expect(filter).toEqual({ _id: "s2" });
    expect(update.$set).toMatchObject({ matchTextHash: seekerMatchText({ skills: ["Vue"] }).hash, matchEmbeddingModel: "qwen/qwen3-embedding-8b" });
    expect(update.$set.matchEmbedding).toHaveLength(MATCH_EMBEDDING_DIMS);
    expect(options).toEqual({ timestamps: false });
  });

  it("clears the vector of a profile that has nothing left to embed", async () => {
    seekerDocs = [{ _id: "s3", matchTextHash: "old" }];
    const out = await refreshMatchEmbeddings("seeker", {}, { limit: 50 });
    expect(out.emptied).toBe(1);
    expect(embedForMatching).not.toHaveBeenCalled();
    expect(seekerUpdate).toHaveBeenCalledWith(
      { _id: "s3" },
      { $set: { matchTextHash: seekerMatchText({}).hash }, $unset: { matchEmbedding: 1, matchEmbeddingAt: 1, matchEmbeddingModel: 1 } },
      { timestamps: false },
    );
  });

  it("extracts AI skills for a job with none before embedding it", async () => {
    const description = "We need someone to keep our books, reconcile accounts and prepare monthly reports in Excel.";
    jobDocs = [{ _id: "j1", title: "Bookkeeper", description, requirements: { skills: [] } }];
    extractJobSkills.mockResolvedValueOnce({ skills: ["Excel", "Bookkeeping"], preferred: ["QuickBooks"] });

    const out = await refreshMatchEmbeddings("job", {}, { limit: 50 });

    expect(out.skillsExtracted).toBe(1);
    expect(jobUpdate.mock.calls[0]).toEqual([
      { _id: "j1" },
      { $set: { "requirements.aiSkills": ["Excel", "Bookkeeping"], "requirements.aiPreferredSkills": ["QuickBooks"], "requirements.aiSkillsAt": expect.any(Date) } },
      { timestamps: false },
    ]);
    expect(embedForMatching.mock.calls[0][0][0]).toContain("Skills: Excel, Bookkeeping");
  });

  it("does not ask for skills twice, or for a job that already has some", async () => {
    jobDocs = [
      { _id: "j2", title: "A", description: "x".repeat(100), requirements: { skills: ["React"] } },
      { _id: "j3", title: "B", description: "x".repeat(100), requirements: { skills: [], aiSkillsAt: new Date() } },
    ];
    await refreshMatchEmbeddings("job", {}, { limit: 50 });
    expect(extractJobSkills).not.toHaveBeenCalled();
    expect(embedForMatching.mock.calls[0][0]).toEqual([
      jobMatchText(jobDocs[0]).text,
      jobMatchText(jobDocs[1]).text,
    ]);
  });

  it("writes nothing and calls no AI on a dry run", async () => {
    seekerDocs = [{ _id: "s2", skills: ["Vue"], matchTextHash: "old" }];
    const out = await refreshMatchEmbeddings("seeker", {}, { limit: 50, dryRun: true });
    expect(out.embedded).toBe(1);
    expect(embedForMatching).not.toHaveBeenCalled();
    expect(seekerUpdate).not.toHaveBeenCalled();
  });
});
