/**
 * @jest-environment node
 *
 * The admin search vector in Vectorize (SEARCH_VECTOR_STORE=vectorize): cut to
 * 768 and re-normalised, stored under the JobSeeker _id, Mongo marked and its
 * copy removed; and the default (mongo) unchanged. Vectorize runs as the real
 * Worker handler (global fetch routed into worker.fetch) over an in-memory index.
 */
const mockUpdateOne = jest.fn(async () => ({}));
const mockUpdateMany = jest.fn(async () => ({}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    updateOne: (...a: unknown[]) => mockUpdateOne(...(a as [])),
    updateMany: (...a: unknown[]) => mockUpdateMany(...(a as [])),
  },
}));

import worker from "../../../workers/mployedin-data/src/index";
import { TEST_SECRET, fakeIndex, testEnv, type TestEnv } from "../../../workers/mployedin-data/src/__tests__/testEnv";
import {
  SEARCH_TOP_K,
  SEARCH_VECTOR_DIMS,
  eraseSearchVector,
  missingSearchVectorFilter,
  saveSearchVectors,
  searchSeekerVectors,
  searchVectorStore,
  toSearchVector,
} from "@/lib/ai/searchVectors";

const ID1 = "65f0c0ffee0000000000aa01";
const ID2 = "65f0c0ffee0000000000aa02";
/** A 3072-d Gemini-shaped vector pointing mostly along `axis` (within the first 768). */
const gemini = (axis: number, tilt = 0) => Array.from({ length: 3072 }, (_, i) => (i === axis ? 3 : i === axis + 1 ? tilt : i >= 768 ? 0.5 : 0));

describe("searchVectors", () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  let env: TestEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    env = { ...testEnv(), VEC_SEARCH: fakeIndex() };
    process.env.DATA_WORKER_URL = "https://data.test";
    process.env.DATA_WORKER_SECRET = TEST_SECRET;
    process.env.SEARCH_VECTOR_STORE = "vectorize";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), env)) as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    global.fetch = realFetch;
  });

  it("is mongo unless vectorize is asked for and the Worker is configured", () => {
    expect(searchVectorStore({})).toBe("mongo");
    expect(searchVectorStore({ SEARCH_VECTOR_STORE: "vectorize" })).toBe("mongo");
    expect(searchVectorStore({ SEARCH_VECTOR_STORE: "Vectorize", DATA_WORKER_URL: "https://x", DATA_WORKER_SECRET: TEST_SECRET })).toBe("vectorize");
  });

  it("cuts a vector to its first 768 values at unit length, and refuses short or zero vectors", () => {
    const v = toSearchVector(gemini(0, 4))!;
    expect(v).toHaveLength(SEARCH_VECTOR_DIMS);
    expect(Math.hypot(...v)).toBeCloseTo(1, 10);
    expect(v[0]).toBeCloseTo(0.6, 10);
    expect(v[1]).toBeCloseTo(0.8, 10);
    expect(toSearchVector(Array(100).fill(1))).toBeNull();
    expect(toSearchVector(Array(3072).fill(0))).toBeNull();
  });

  it("vectorize: stores 768-d vectors under the profile id, marks the profile and drops Mongo's copy", async () => {
    await saveSearchVectors([{ id: ID1, embedding: gemini(0) }, { id: ID2, embedding: [1, 2] }]);
    expect(env.VEC_SEARCH.upserted.map((v) => [v.id, (v.values as number[]).length])).toEqual([[ID1, SEARCH_VECTOR_DIMS]]);
    const [filter, update] = mockUpdateMany.mock.calls[0] as unknown as [{ _id: { $in: unknown[] } }, Record<string, unknown>];
    expect(filter._id.$in.map(String)).toEqual([ID1]);
    expect(update).toEqual({ $set: { searchVectorAt: expect.any(Date) }, $unset: { searchEmbedding: 1 } });
    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(missingSearchVectorFilter()).toEqual({ searchVectorAt: { $exists: false } });
  });

  it("mongo (default): stores the full vector on the profile, as before, and never calls the Worker", async () => {
    delete process.env.SEARCH_VECTOR_STORE;
    const embedding = gemini(0);
    await saveSearchVectors([{ id: ID1, embedding }]);
    expect(mockUpdateOne).toHaveBeenCalledWith({ _id: ID1 }, { $set: { searchEmbedding: embedding } });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(missingSearchVectorFilter()).toEqual({ "searchEmbedding.0": { $exists: false } });
  });

  it("searches nearest first above the similarity floor, asking Vectorize for its full topK", async () => {
    await saveSearchVectors([
      { id: ID1, embedding: gemini(0) },
      { id: ID2, embedding: gemini(0, 1) },
      { id: "65f0c0ffee0000000000aa03", embedding: gemini(9) },
    ]);
    const hits = await searchSeekerVectors(gemini(0), 0.35);
    expect(hits.map((h) => h.id)).toEqual([ID1, ID2]);
    expect(hits[0].score).toBeCloseTo(1, 6);
    const query = JSON.parse(String((global.fetch as jest.Mock).mock.calls.at(-1)[1].body));
    expect(query).toMatchObject({ index: "search", topK: SEARCH_TOP_K });
    expect(query.vector).toHaveLength(SEARCH_VECTOR_DIMS);
  });

  it("search throws when Vectorize can't answer, so the route can say so", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as typeof fetch;
    await expect(searchSeekerVectors(gemini(0), 0.35)).rejects.toThrow("data worker unreachable");
  });

  it("erasure removes the vector whenever the Worker is configured, and throws if it can't", async () => {
    await saveSearchVectors([{ id: ID1, embedding: gemini(0) }]);
    delete process.env.SEARCH_VECTOR_STORE; // switched back: D1/Vectorize may still hold data
    await eraseSearchVector(ID1);
    expect(env.VEC_SEARCH.deleted).toEqual([ID1]);
    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as typeof fetch;
    await expect(eraseSearchVector(ID1)).rejects.toThrow();
    delete process.env.DATA_WORKER_URL;
    await expect(eraseSearchVector(ID1)).resolves.toBeUndefined();
  });
});
