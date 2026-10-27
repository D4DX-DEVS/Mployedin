/**
 * @jest-environment node
 *
 * VECTOR_STORE: which store answers vector retrieval, and that Vectorize is kept
 * in step. Vectorize runs as the real Worker handler (global fetch routed into
 * worker.fetch) over an in-memory index that ranks by cosine like Vectorize.
 */
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    info: (...a: unknown[]) => mockInfo(...a),
    warn: (...a: unknown[]) => mockWarn(...a),
    error: (...a: unknown[]) => mockError(...a),
  },
}));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  c.select = jest.fn(() => c);
  c.limit = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
const jobAggregate = jest.fn();
let seekerDoc: Record<string, unknown> | null = null;
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain(seekerDoc)), aggregate: jest.fn(), find: jest.fn(() => chain([])) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(), aggregate: (...a: unknown[]) => jobAggregate(...a), find: jest.fn(() => chain([{ _id: "jClosed" }])) },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));

import worker from "../../../workers/mployedin-data/src/index";
import { TEST_SECRET, fakeIndex, testEnv, type TestEnv } from "../../../workers/mployedin-data/src/__tests__/testEnv";
import { resetVectorRetrievalForTests, vectorRetrieveJobs } from "@/lib/matching/vectorRetrieval";
import {
  VECTORIZE_TOP_K,
  removeMatchVectors,
  shadowOverlap,
  syncMatchVectors,
  vectorStore,
} from "@/lib/matching/vectorStore";
import { pruneDepartedVectors } from "@/lib/matching/vectorDepartures";

const DIMS = 1024;
/** Lets background promises (the shadow comparison) settle. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};
/** A unit vector pointing mostly along axis `axis`. */
const along = (axis: number, tilt = 0) => Array.from({ length: DIMS }, (_, i) => (i === axis ? 1 : i === axis + 1 ? tilt : 0));

describe("VECTOR_STORE", () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  let env: TestEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    resetVectorRetrievalForTests();
    // Real in-memory indexes (testEnv's jobs index answers canned matches).
    env = { ...testEnv(), VEC_JOBS: fakeIndex(), VEC_SEEKERS: fakeIndex() };
    process.env.DATA_WORKER_URL = "https://data.test";
    process.env.DATA_WORKER_SECRET = TEST_SECRET;
    process.env.MATCH_VECTOR_RETRIEVAL = "on";
    delete process.env.OPENROUTER_EMBEDDING_MODEL;
    seekerDoc = { _id: "s1", matchEmbedding: along(0), matchEmbeddingModel: "qwen/qwen3-embedding-8b" };
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), env)) as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    global.fetch = realFetch;
  });

  it("is atlas unless shadow/vectorize is asked for and the Worker is configured", () => {
    expect(vectorStore({})).toBe("atlas");
    expect(vectorStore({ VECTOR_STORE: "vectorize" })).toBe("atlas");
    const worker = { DATA_WORKER_URL: "https://x", DATA_WORKER_SECRET: TEST_SECRET };
    expect(vectorStore({ ...worker, VECTOR_STORE: "Shadow " })).toBe("shadow");
    expect(vectorStore({ ...worker, VECTOR_STORE: "vectorize" })).toBe("vectorize");
    expect(vectorStore({ ...worker, VECTOR_STORE: "pinecone" })).toBe("atlas");
  });

  it("atlas: Vectorize is neither written nor asked", async () => {
    delete process.env.VECTOR_STORE;
    await syncMatchVectors("job", [{ id: "j1", values: along(0) }]);
    jobAggregate.mockResolvedValueOnce([{ _id: "j1" }]);
    expect(await vectorRetrieveJobs("s1", 600)).toEqual(["j1"]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("vectorize: answers nearest first, capped at Vectorize's topK, without Atlas", async () => {
    process.env.VECTOR_STORE = "vectorize";
    await syncMatchVectors("job", [
      { id: "far", values: along(5) },
      { id: "near", values: along(0, 0.1) },
      { id: "nearest", values: along(0) },
    ]);
    expect(await vectorRetrieveJobs("s1", 600)).toEqual(["nearest", "near", "far"]);
    expect(jobAggregate).not.toHaveBeenCalled();
    const query = JSON.parse(String((global.fetch as jest.Mock).mock.calls.at(-1)[1].body));
    expect(query).toMatchObject({ index: "jobs", topK: VECTORIZE_TOP_K });
  });

  it("vectorize: answers null (the plain query) when the Worker is down", async () => {
    process.env.VECTOR_STORE = "vectorize";
    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as typeof fetch;
    expect(await vectorRetrieveJobs("s1", 600)).toBeNull();
    expect(mockWarn).toHaveBeenCalled();
  });

  it("shadow: Atlas answers, and the overlap with Vectorize is logged", async () => {
    process.env.VECTOR_STORE = "shadow";
    await syncMatchVectors("job", [
      { id: "a", values: along(0) },
      { id: "b", values: along(0, 0.2) },
    ]);
    jobAggregate.mockResolvedValueOnce([{ _id: "a" }, { _id: "c" }]);
    expect(await vectorRetrieveJobs("s1", 600)).toEqual(["a", "c"]);
    await settle();
    expect(mockInfo).toHaveBeenCalledWith(
      { event: "vector_shadow", kind: "job", compared: 2, overlap: 1, ratio: 0.5 },
      "[vectorRetrieval] shadow comparison",
    );
  });

  it("shadow: a failing Vectorize never changes Atlas's answer", async () => {
    process.env.VECTOR_STORE = "shadow";
    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as typeof fetch;
    jobAggregate.mockResolvedValueOnce([{ _id: "a" }]);
    expect(await vectorRetrieveJobs("s1", 600)).toEqual(["a"]);
    await settle();
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("sync never throws, and logs when Vectorize refuses", async () => {
    process.env.VECTOR_STORE = "vectorize";
    await expect(syncMatchVectors("job", [{ id: "bad", values: [1, 2, 3] }])).resolves.toBeUndefined();
    expect(mockError.mock.calls[0][0]).toMatchObject({ event: "vector_sync_failed", kind: "job" });
  });

  it("removes departed vectors so a closed job stops taking a topK slot", async () => {
    process.env.VECTOR_STORE = "vectorize";
    await syncMatchVectors("job", [
      { id: "jClosed", values: along(0) },
      { id: "jOpen", values: along(0, 0.3) },
    ]);
    expect(await pruneDepartedVectors(new Date())).toEqual({ jobs: 1, seekers: 0 });
    expect(await vectorRetrieveJobs("s1", 600)).toEqual(["jOpen"]);
    await removeMatchVectors("job", ["jOpen"]);
    // Nothing in Vectorize: null (the plain query), never an empty pool.
    expect(await vectorRetrieveJobs("s1", 600)).toBeNull();
  });

  it("vectorize: an empty index (not backfilled yet) never empties the caller's pool", async () => {
    process.env.VECTOR_STORE = "vectorize";
    expect(await vectorRetrieveJobs("s1", 600)).toBeNull();
  });

  it("vectorize: backs off for a minute after a failure instead of waiting on every request", async () => {
    process.env.VECTOR_STORE = "vectorize";
    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as typeof fetch;
    expect(await vectorRetrieveJobs("s1", 600)).toBeNull();
    expect(await vectorRetrieveJobs("s1", 600)).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("shadowOverlap", () => {
  it("compares Vectorize against the head of Atlas's list that Vectorize can return", () => {
    const atlas = Array.from({ length: 300 }, (_, i) => `id${i}`);
    expect(shadowOverlap(atlas, atlas.slice(0, 100))).toEqual({ compared: 100, overlap: 100, ratio: 1 });
    expect(shadowOverlap(atlas, atlas.slice(50, 150))).toEqual({ compared: 100, overlap: 50, ratio: 0.5 });
    expect(shadowOverlap([], [])).toEqual({ compared: 0, overlap: 0, ratio: 1 });
  });
});
