/**
 * @jest-environment node
 *
 * POST /api/job-seekers/vector-search with SEARCH_VECTOR_STORE=vectorize: hits
 * come from Vectorize (the real Worker handler behind global fetch), deleted
 * profiles are dropped in Mongo, Atlas and the in-memory scan are never used,
 * and an unreachable Vectorize is a clear 503.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: "admin"; locale: string }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: "admin_user_001", role: "admin", locale: "en" }),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));
const mockAtlas = jest.fn();
jest.mock("@/lib/ai/atlasVectorSearch", () => ({ atlasVectorSearch: (...a: unknown[]) => mockAtlas(...a) }));
/** Every query embedding points along axis 0. */
const queryVector = Array.from({ length: 3072 }, (_, i) => (i === 0 ? 1 : 0));
jest.mock("@/lib/ai/embeddings", () => ({
  ...jest.requireActual("@/lib/ai/embeddings"),
  generateEmbedding: jest.fn(async () => queryVector),
}));

const ALIVE = "65f0c0ffee0000000000aa01";
const DELETED = "65f0c0ffee0000000000aa02";
const mockFindFilters: Array<Record<string, unknown>> = [];
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["select", "limit", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: Record<string, unknown>) => {
      mockFindFilters.push(filter);
      if ("searchVectorAt" in filter || "searchEmbedding.0" in filter) return chain([]); // backfill: none missing
      if ("status" in filter) return chain([{ _id: ALIVE }]); // the deleted profile fails the status check
      return chain([{ _id: ALIVE, fullName: "Ada" }]); // hydration
    }),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

import worker from "../../../workers/mployedin-data/src/index";
import { TEST_SECRET, fakeIndex, testEnv, type TestEnv } from "../../../workers/mployedin-data/src/__tests__/testEnv";
import { POST } from "@/app/api/job-seekers/vector-search/route";

const near = (tilt: number) => Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : i === 1 ? tilt : 0));
const request = () =>
  new NextRequest("http://localhost/api/job-seekers/vector-search", { method: "POST", body: JSON.stringify({ query: "react developer" }) });

describe("vector search on Vectorize", () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  let env: TestEnv;

  beforeEach(async () => {
    mockFindFilters.length = 0;
    mockAtlas.mockReset();
    env = { ...testEnv(), VEC_SEARCH: fakeIndex() };
    await env.VEC_SEARCH.upsert([
      { id: ALIVE, values: near(0.1) },
      { id: DELETED, values: near(0) },
    ]);
    process.env.DATA_WORKER_URL = "https://data.test";
    process.env.DATA_WORKER_SECRET = TEST_SECRET;
    process.env.SEARCH_VECTOR_STORE = "vectorize";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), env)) as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    global.fetch = realFetch;
  });

  it("answers from Vectorize, without deleted profiles, and never asks Atlas", async () => {
    const res = await POST(request(), {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ mode: "vectorize", total: 1 });
    expect(body.items.map((i: { _id: string }) => i._id)).toEqual([ALIVE]);
    expect(mockAtlas).not.toHaveBeenCalled();
    const statusCheck = mockFindFilters.find((f) => "status" in f && "_id" in f)!;
    expect(statusCheck).toMatchObject({ status: { $ne: "deleted" } });
    expect((statusCheck._id as { $in: string[] }).$in.sort()).toEqual([ALIVE, DELETED].sort());
    // The backfill looks for profiles not yet in Vectorize, not for a Mongo vector.
    expect(mockFindFilters.some((f) => "searchVectorAt" in f)).toBe(true);
  });

  it("says search is unavailable when Vectorize can't answer", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as typeof fetch;
    const res = await POST(request(), {} as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Semantic search is unavailable right now. Try again in a minute." });
    expect(mockAtlas).not.toHaveBeenCalled();
  });

  it("is unchanged on the default store: Atlas answers", async () => {
    delete process.env.SEARCH_VECTOR_STORE;
    mockAtlas.mockResolvedValueOnce([{ id: ALIVE, score: 0.9 }]);
    const res = await POST(request(), {} as never);
    expect((await res.json()).mode).toBe("atlas-vector");
    expect(mockAtlas).toHaveBeenCalled();
  });
});
