/**
 * @jest-environment node
 *
 * The app's client against the real Worker handler (workers/mployedin-data) on
 * real SQLite: global fetch is routed into worker.fetch, so signing, routing,
 * validation and SQL all run as they will in production, minus Cloudflare.
 */
import worker from "../../../../workers/mployedin-data/src/index";
import { TEST_SECRET, testEnv, type TestEnv } from "../../../../workers/mployedin-data/src/__tests__/testEnv";
import {
  DataWorkerError,
  dataWorkerConfigured,
  queryVectors,
  readLogPage,
  upsertVectors,
  writeLogRows,
} from "@/lib/cloudflare/dataWorkerClient";

describe("dataWorkerClient", () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  let env: TestEnv;

  beforeEach(() => {
    env = testEnv();
    process.env.DATA_WORKER_URL = "https://data.test/";
    process.env.DATA_WORKER_SECRET = TEST_SECRET;
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
      worker.fetch(new Request(input, init), env),
    ) as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    global.fetch = realFetch;
  });

  it("is configured only with a URL and a 32+ character secret", () => {
    expect(dataWorkerConfigured({})).toBe(false);
    expect(dataWorkerConfigured({ DATA_WORKER_URL: "https://x", DATA_WORKER_SECRET: "short" })).toBe(false);
    expect(dataWorkerConfigured({ DATA_WORKER_URL: "https://x", DATA_WORKER_SECRET: TEST_SECRET })).toBe(true);
  });

  it("writes and reads logs through the Worker", async () => {
    await writeLogRows([
      { table: "audit_log", row: { id: "a1", created_at: 1_700_000_000_000, action: "login", resource: "user", actor_id: "u1" } },
    ]);
    const page = await readLogPage("audit_log", { actor_id: "u1", page: 1, pageSize: 20, search: undefined });
    expect(page).toMatchObject({ total: 1, data: [{ id: "a1", action: "login" }] });
  });

  it("splits a large vector upsert into Worker-sized calls", async () => {
    const vectors = Array.from({ length: 250 }, (_, i) => ({ id: `v${i}`, values: Array(1024).fill(0.01) }));
    expect(await upsertVectors("seekers", vectors)).toEqual({ upserted: 250 });
    expect(global.fetch).toHaveBeenCalledTimes(5);
    expect(env.VEC_SEEKERS.upserted.map((v) => v.id)).toEqual(vectors.map((v) => v.id));
  });

  it("queries vectors through the Worker", async () => {
    const res = await queryVectors("jobs", { vector: Array(1024).fill(0.1), topK: 10 });
    expect(res.matches).toEqual([{ id: "65f0c0ffee0000000000aaaa", score: 0.91 }]);
  });

  it("surfaces the Worker's 400 message, and refuses to call when not configured", async () => {
    await expect(readLogPage("audit_log", { pageSize: 7 })).rejects.toMatchObject({
      name: "DataWorkerError",
      status: 400,
      message: "pageSize must be 10, 20, 50 or 100",
    });
    delete process.env.DATA_WORKER_SECRET;
    await expect(readLogPage("audit_log", {})).rejects.toEqual(new DataWorkerError(503, "data worker is not configured"));
  });

  it("reports an unreachable Worker as 504", async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    await expect(writeLogRows([])).rejects.toMatchObject({ status: 504, message: "data worker unreachable" });
  });
});
