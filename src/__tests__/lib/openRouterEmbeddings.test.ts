/**
 * @jest-environment node
 *
 * Matching vectors come from OpenRouter's embeddings endpoint: 1024 numbers
 * per text, in input order, with no data retention. Anything else is an error
 * the caller must see; a wrong-sized vector stored by mistake would break the
 * Atlas index for every query.
 */
const providerFetch = jest.fn();
jest.mock("@/lib/ai/providerFetch", () => ({
  providerFetch: (...args: unknown[]) => providerFetch(...args),
  readJsonWithin: (res: Response) => res.json(),
}));

import { embedForMatching, matchEmbeddingModel, MATCH_EMBEDDING_DIMS } from "@/lib/ai/openRouterEmbeddings";

const vector = (fill: number, dims = MATCH_EMBEDDING_DIMS) => Array.from({ length: dims }, () => fill);
const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
const sentBody = (call: number) => JSON.parse((providerFetch.mock.calls[call][1] as RequestInit).body as string);

beforeEach(() => {
  providerFetch.mockReset();
  process.env.OPENROUTER_API_KEY = "or-test-key";
  delete process.env.OPENROUTER_EMBEDDING_MODEL;
});

describe("embedForMatching", () => {
  it("asks for 1024-d Qwen vectors with no data retention, and returns them in input order", async () => {
    providerFetch.mockResolvedValueOnce(
      ok([
        { index: 1, embedding: vector(2) },
        { index: 0, embedding: vector(1) },
      ]),
    );
    const out = await embedForMatching(["first", "second"]);
    expect(providerFetch.mock.calls[0][0]).toMatch(/\/embeddings$/);
    expect(sentBody(0)).toEqual({
      model: "qwen/qwen3-embedding-8b",
      input: ["first", "second"],
      dimensions: 1024,
      provider: { data_collection: "deny" },
    });
    expect(out.map((v) => v[0])).toEqual([1, 2]);
  });

  it("sends at most 64 texts per request", async () => {
    providerFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const { input } = JSON.parse(init.body as string) as { input: string[] };
      return ok(input.map((_, index) => ({ index, embedding: vector(index) })));
    });
    const out = await embedForMatching(Array.from({ length: 70 }, (_, i) => `t${i}`));
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(sentBody(0).input).toHaveLength(64);
    expect(sentBody(1).input).toHaveLength(6);
    expect(out).toHaveLength(70);
  });

  it("refuses a vector of the wrong size", async () => {
    providerFetch.mockResolvedValueOnce(ok([{ index: 0, embedding: vector(1, 4096) }]));
    await expect(embedForMatching(["x"])).rejects.toThrow(/4096 dims, expected 1024/);
  });

  it("surfaces a provider error instead of returning nothing", async () => {
    providerFetch.mockResolvedValueOnce(new Response("no provider", { status: 404 }));
    await expect(embedForMatching(["x"])).rejects.toThrow(/embeddings 404/);
  });

  it("makes no call for no texts", async () => {
    expect(await embedForMatching([])).toEqual([]);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("can be pointed at another model from env", () => {
    process.env.OPENROUTER_EMBEDDING_MODEL = "other/embedder";
    expect(matchEmbeddingModel()).toBe("other/embedder");
  });
});
