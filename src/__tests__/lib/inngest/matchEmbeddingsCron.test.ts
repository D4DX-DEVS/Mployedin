/**
 * @jest-environment node
 *
 * The refresh cron does nothing until MATCH_EMBEDDINGS=on and an OpenRouter
 * key exist, then sweeps recently changed and never-processed documents.
 */
const refresh = jest.fn(async () => ({ scanned: 0, embedded: 0, unchanged: 0, emptied: 0, skillsExtracted: 0 }));
jest.mock("@/lib/matching/matchEmbeddings", () => ({ refreshMatchEmbeddings: (...a: unknown[]) => refresh(...(a as [])) }));
jest.mock("@/lib/inngest/client", () => ({ inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) } }));

import { refreshMatchEmbeddingsCron } from "@/lib/inngest/matchEmbeddings";

const fn = refreshMatchEmbeddingsCron as unknown as {
  config: { id: string; triggers: Array<{ cron: string }>; concurrency: { limit: number } };
  handler: (ctx: { step: { run: (name: string, f: () => unknown) => unknown } }) => Promise<unknown>;
};
const step = { run: async (_name: string, f: () => unknown) => f() };

beforeEach(() => {
  refresh.mockClear();
  process.env.MATCH_EMBEDDINGS = "on";
  process.env.OPENROUTER_API_KEY = "or-test-key";
});

describe("refresh-match-embeddings cron", () => {
  it("runs every 15 minutes, one at a time", () => {
    expect(fn.config).toMatchObject({ id: "refresh-match-embeddings", triggers: [{ cron: "*/15 * * * *" }], concurrency: { limit: 1 } });
  });

  it("is off unless MATCH_EMBEDDINGS=on", async () => {
    process.env.MATCH_EMBEDDINGS = "off";
    expect(await fn.handler({ step })).toEqual({ skipped: "MATCH_EMBEDDINGS is not on" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is off without an OpenRouter key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(await fn.handler({ step })).toEqual({ skipped: "no OpenRouter key" });
  });

  it("sweeps changed and never-processed jobs and seekers", async () => {
    await fn.handler({ step });
    const calls = refresh.mock.calls as unknown as Array<[string, Record<string, unknown>, { limit: number }]>;
    expect(calls.map(([kind, , o]) => [kind, o.limit])).toEqual([
      ["job", 200],
      ["job", 100],
      ["seeker", 200],
      ["seeker", 100],
    ]);
    expect(calls[0][1]).toMatchObject({ status: "active", deletedAt: null, updatedAt: { $gte: expect.any(Date) } });
    expect(calls[1][1]).toMatchObject({ status: "active", deletedAt: null, matchTextHash: { $exists: false } });
    expect(calls[2][1]).toMatchObject({ roleArchivedAt: null, updatedAt: { $gte: expect.any(Date) } });
    expect(calls[3][1]).toMatchObject({ roleArchivedAt: null, matchTextHash: { $exists: false } });
  });
});
