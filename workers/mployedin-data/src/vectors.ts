/**
 * Vectorize access. A vector's id is the MongoDB _id (24-hex) of the record it
 * embeds, so search returns ids the app loads from Mongo directly.
 *
 * Metadata is restricted to the filter fields each index declares: Vectorize
 * allows 10 metadata indexes per index and indexes 64 bytes of a value, and a
 * metadata field without an index cannot be filtered on. Create the metadata
 * indexes BEFORE loading vectors (see README.md); vectors written earlier are
 * not filterable.
 */

import type { Env, VectorizeIndex, VectorizeQueryOptions, VectorizeVector } from "./types";
import { BadRequest } from "./logs";

type MetaType = "string" | "number" | "boolean";

interface IndexSpec {
  binding: "VEC_JOBS" | "VEC_SEEKERS" | "VEC_SEARCH";
  dimensions: number;
  metadata: Record<string, MetaType>;
}

/**
 * The app's matching vectors (src/lib/ai/openRouterEmbeddings.ts MATCH_EMBEDDING_DIMS):
 * one per job and per seeker. Skill vectors stay in Mongo: they are read by key
 * and compared in memory, never searched by nearness.
 */
export const MATCH_DIMENSIONS = 1024;

/**
 * The admin semantic search vector of each seeker (src/lib/ai/searchVectors.ts):
 * Gemini's 3072-d embedding cut to its first 768 values and re-normalised
 * (the model is trained for that), since Vectorize stops at 1536.
 */
export const SEARCH_DIMENSIONS = 768;

export const VECTOR_INDEXES: Record<string, IndexSpec> = {
  jobs: {
    binding: "VEC_JOBS",
    dimensions: MATCH_DIMENSIONS,
    metadata: {
      country: "string",
      state: "string",
      status: "string",
      industry: "string",
      employmentType: "string",
      employerId: "string",
    },
  },
  seekers: {
    binding: "VEC_SEEKERS",
    dimensions: MATCH_DIMENSIONS,
    metadata: {
      country: "string",
      state: "string",
      regionCityId: "string",
      visibility: "string",
      superAgentId: "string",
    },
  },
  search: { binding: "VEC_SEARCH", dimensions: SEARCH_DIMENSIONS, metadata: {} },
};

/**
 * 1024 numbers serialise to ~20-22 KB of JSON, so 50 vectors (~1.1 MB) stay
 * well under the 2 MB request cap in index.ts. Vectorize itself takes 1000 per call;
 * the app client (upsertVectors) splits larger sets into calls of this size.
 */
export const MAX_UPSERT = 50;
const MAX_DELETE = 1000;
const MAX_TOPK = 100;
const MAX_TOPK_WITH_METADATA = 50;
const FILTER_OPS = new Set(["$eq", "$ne", "$in", "$nin", "$lt", "$lte", "$gt", "$gte"]);
const encoder = new TextEncoder();

function indexOf(env: Env, name: unknown): { spec: IndexSpec; index: VectorizeIndex } {
  const spec = typeof name === "string" && Object.prototype.hasOwnProperty.call(VECTOR_INDEXES, name)
    ? VECTOR_INDEXES[name]
    : undefined;
  if (!spec) throw new BadRequest(`unknown index ${String(name)}`);
  return { spec, index: env[spec.binding] };
}

function checkId(id: unknown): string {
  if (typeof id !== "string" || id.length === 0 || encoder.encode(id).length > 64) {
    throw new BadRequest("vector id must be 1-64 bytes");
  }
  return id;
}

function checkValues(spec: IndexSpec, values: unknown): number[] {
  if (!Array.isArray(values) || values.length !== spec.dimensions) {
    throw new BadRequest(`vector must have ${spec.dimensions} numbers`);
  }
  for (const v of values) if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequest("vector values must be finite numbers");
  return values as number[];
}

function checkScalar(spec: IndexSpec, key: string, value: unknown): void {
  const type = spec.metadata[key];
  if (!type) throw new BadRequest(`unknown metadata field ${key}`);
  if (typeof value !== type) throw new BadRequest(`${key} must be a ${type}`);
  if (typeof value === "string" && encoder.encode(value).length > 64) {
    throw new BadRequest(`${key} is longer than the 64 bytes Vectorize indexes`);
  }
}

function checkMetadata(spec: IndexSpec, metadata: unknown): VectorizeVector["metadata"] {
  if (metadata === undefined) return undefined;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new BadRequest("metadata must be an object");
  for (const [key, value] of Object.entries(metadata)) checkScalar(spec, key, value);
  return metadata as VectorizeVector["metadata"];
}

function checkFilter(spec: IndexSpec, filter: unknown): Record<string, unknown> | undefined {
  if (filter === undefined) return undefined;
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) throw new BadRequest("filter must be an object");
  for (const [key, condition] of Object.entries(filter)) {
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      for (const [op, operand] of Object.entries(condition)) {
        if (!FILTER_OPS.has(op)) throw new BadRequest(`unsupported filter operator ${op}`);
        const operands = op === "$in" || op === "$nin" ? operand : [operand];
        if (!Array.isArray(operands) || operands.length === 0) throw new BadRequest(`${op} needs a non-empty list`);
        for (const v of operands) checkScalar(spec, key, v);
      }
    } else {
      checkScalar(spec, key, condition);
    }
  }
  return filter as Record<string, unknown>;
}

export async function upsertVectors(env: Env, body: { index?: unknown; vectors?: unknown }): Promise<{ upserted: number }> {
  const { spec, index } = indexOf(env, body.index);
  if (!Array.isArray(body.vectors) || body.vectors.length === 0 || body.vectors.length > MAX_UPSERT) {
    throw new BadRequest(`vectors must hold 1-${MAX_UPSERT} items`);
  }
  const vectors: VectorizeVector[] = body.vectors.map((v: Record<string, unknown>) => ({
    id: checkId(v?.id),
    values: checkValues(spec, v?.values),
    ...(v?.metadata !== undefined && { metadata: checkMetadata(spec, v.metadata) }),
  }));
  await index.upsert(vectors);
  return { upserted: vectors.length };
}

export async function queryVectors(
  env: Env,
  body: { index?: unknown; vector?: unknown; id?: unknown; topK?: unknown; filter?: unknown; returnMetadata?: unknown },
): Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> }> {
  const { spec, index } = indexOf(env, body.index);
  const withMetadata = body.returnMetadata === true;
  const cap = withMetadata ? MAX_TOPK_WITH_METADATA : MAX_TOPK;
  const topK = body.topK === undefined ? 20 : body.topK;
  if (typeof topK !== "number" || !Number.isInteger(topK) || topK < 1 || topK > cap) {
    throw new BadRequest(`topK must be 1-${cap}${withMetadata ? " when metadata is returned" : ""}`);
  }
  const options: VectorizeQueryOptions = {
    topK,
    returnValues: false,
    returnMetadata: withMetadata ? "indexed" : "none",
    ...(body.filter !== undefined && { filter: checkFilter(spec, body.filter) }),
  };
  if ((body.vector === undefined) === (body.id === undefined)) throw new BadRequest("send exactly one of vector or id");
  const res = body.vector !== undefined
    ? await index.query(checkValues(spec, body.vector), options)
    : await index.queryById(checkId(body.id), options);
  return {
    matches: res.matches.map((m) => ({ id: m.id, score: m.score, ...(withMetadata && m.metadata && { metadata: m.metadata }) })),
  };
}

export async function deleteVectors(env: Env, body: { index?: unknown; ids?: unknown }): Promise<{ deleted: number }> {
  const { index } = indexOf(env, body.index);
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > MAX_DELETE) {
    throw new BadRequest(`ids must hold 1-${MAX_DELETE} items`);
  }
  await index.deleteByIds(body.ids.map(checkId));
  return { deleted: body.ids.length };
}
