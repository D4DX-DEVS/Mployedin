/**
 * @jest-environment node
 *
 * Vector retrieval picks the ids the engine then scores. It answers null, so
 * the caller keeps today's query, whenever it is off, the source has no
 * current vector, or Atlas refuses $vectorSearch; after a failure it stays out
 * of the way for five minutes instead of failing every request.
 */
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn() } }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  c.select = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
let seekerDoc: Record<string, unknown> | null = null;
let jobDoc: Record<string, unknown> | null = null;
const jobAggregate = jest.fn();
const seekerAggregate = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain(seekerDoc)), aggregate: (...a: unknown[]) => seekerAggregate(...a) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain(jobDoc)), aggregate: (...a: unknown[]) => jobAggregate(...a) },
}));

import {
  vectorRetrieveJobs,
  vectorRetrieveSeekers,
  vectorRetrievalEnabled,
  restrictToIds,
  resetVectorRetrievalForTests,
} from "@/lib/matching/vectorRetrieval";

const vec = [0.1, 0.2];
const current = { matchEmbedding: vec, matchEmbeddingModel: "qwen/qwen3-embedding-8b" };

beforeEach(() => {
  jest.clearAllMocks();
  resetVectorRetrievalForTests();
  process.env.MATCH_VECTOR_RETRIEVAL = "on";
  delete process.env.OPENROUTER_EMBEDDING_MODEL;
  seekerDoc = { _id: "s1", ...current };
  jobDoc = { _id: "j1", ...current };
});

describe("vectorRetrieveJobs", () => {
  it("returns the ids of the nearest active jobs to the seeker's vector", async () => {
    jobAggregate.mockResolvedValueOnce([{ _id: "j9" }, { _id: "j7" }]);
    expect(await vectorRetrieveJobs("s1", 600)).toEqual(["j9", "j7"]);
    const [stage] = jobAggregate.mock.calls[0][0] as Array<{ $vectorSearch: Record<string, unknown> }>;
    expect(stage.$vectorSearch).toEqual({
      index: "job_match_vector_index",
      path: "matchEmbedding",
      queryVector: vec,
      numCandidates: 6000,
      limit: 600,
      filter: { status: "active" },
    });
  });

  it("answers null when the flag is off", async () => {
    process.env.MATCH_VECTOR_RETRIEVAL = "off";
    expect(vectorRetrievalEnabled()).toBe(false);
    expect(await vectorRetrieveJobs("s1", 200)).toBeNull();
    expect(jobAggregate).not.toHaveBeenCalled();
  });

  it("answers null for a seeker with no vector, or one built by another model", async () => {
    seekerDoc = { _id: "s1" };
    expect(await vectorRetrieveJobs("s1", 200)).toBeNull();
    seekerDoc = { _id: "s1", matchEmbedding: vec, matchEmbeddingModel: "old/model" };
    expect(await vectorRetrieveJobs("s1", 200)).toBeNull();
    expect(jobAggregate).not.toHaveBeenCalled();
  });

  it("answers null and backs off for five minutes when Atlas refuses", async () => {
    jobAggregate.mockRejectedValueOnce(new Error("index not found"));
    expect(await vectorRetrieveJobs("s1", 200)).toBeNull();
    expect(await vectorRetrieveJobs("s1", 200)).toBeNull();
    expect(jobAggregate).toHaveBeenCalledTimes(1);
  });
});

describe("vectorRetrieveSeekers", () => {
  it("returns the nearest discoverable seekers to the job's vector", async () => {
    seekerAggregate.mockResolvedValueOnce([{ _id: "s5" }]);
    expect(await vectorRetrieveSeekers("j1", 500)).toEqual(["s5"]);
    const [stage] = seekerAggregate.mock.calls[0][0] as Array<{ $vectorSearch: Record<string, unknown> }>;
    expect(stage.$vectorSearch).toMatchObject({ index: "jobseeker_match_vector_index", limit: 500, filter: { profileVisibility: "visible" } });
  });
});

describe("restrictToIds", () => {
  it("narrows a query to the given ids without touching its own _id clause", () => {
    expect(restrictToIds({ status: "active", _id: { $nin: ["a"] } }, ["b"])).toEqual({
      $and: [{ status: "active", _id: { $nin: ["a"] } }, { _id: { $in: ["b"] } }],
    });
  });
});
