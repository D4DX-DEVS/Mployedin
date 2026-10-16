/**
 * Matching vectors through OpenRouter: one 1024-d vector per seeker and per
 * job, compared by Atlas Vector Search to choose which jobs (or seekers) the
 * engine scores. Separate from `embeddings.ts`, whose 3072-d Gemini vectors
 * serve admin search and skill matching and keep their own model.
 *
 * qwen/qwen3-embedding-8b, $0.01 per 1M tokens. OpenRouter honours
 * `dimensions` for it (probe 2026-10-15), so vectors are cut to 1024 at the
 * source. The Atlas indexes are built for exactly that size, which is why it
 * is a constant and not an env setting.
 */
import { OPENROUTER_BASE, openRouterHeaders } from "@/lib/ai/openRouter";
import { providerFetch, readJsonWithin } from "@/lib/ai/providerFetch";

export const MATCH_EMBEDDING_DIMS = 1024;

const BATCH_SIZE = 64;
const EMBED_TIMEOUT_MS = 30_000;
const LABEL = "[matchEmbeddings]";

export function matchEmbeddingModel(): string {
  return process.env.OPENROUTER_EMBEDDING_MODEL || "qwen/qwen3-embedding-8b";
}

/** One vector per text, in input order. Throws on any provider or shape error. */
export async function embedForMatching(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE))));
  }
  return out;
}

async function embedBatch(input: string[]): Promise<number[][]> {
  const res = await providerFetch(
    `${OPENROUTER_BASE}/embeddings`,
    {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify({
        model: matchEmbeddingModel(),
        input,
        dimensions: MATCH_EMBEDDING_DIMS,
        // Profiles go out in these texts; same rule as every chat call.
        provider: { data_collection: "deny" },
      }),
    },
    LABEL,
    EMBED_TIMEOUT_MS,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter embeddings ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await readJsonWithin<{ data?: Array<{ index?: number; embedding?: unknown }> }>(res, LABEL, EMBED_TIMEOUT_MS);
  const rows = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (rows.length !== input.length) {
    throw new Error(`OpenRouter embeddings returned ${rows.length} of ${input.length} vectors`);
  }
  return rows.map((row) => {
    const v = row.embedding;
    const dims = Array.isArray(v) ? v.length : 0;
    if (dims !== MATCH_EMBEDDING_DIMS) throw new Error(`Embedding has ${dims} dims, expected ${MATCH_EMBEDDING_DIMS}`);
    return v as number[];
  });
}
