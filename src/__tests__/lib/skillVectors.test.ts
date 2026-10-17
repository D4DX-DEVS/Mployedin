/**
 * @jest-environment node
 *
 * The skill-vector cache: what it reads back from Mongo, in both storage
 * formats, and what it writes when it embeds a new skill.
 */
import mongoose from "mongoose";

const find = jest.fn();
const bulkWrite = jest.fn(async (..._a: unknown[]) => ({}));
jest.mock("@/models/SkillVector", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => find(...a), bulkWrite: (...a: unknown[]) => bulkWrite(...a) },
}));
const generateEmbeddingBatch = jest.fn();
jest.mock("@/lib/ai/embeddings", () => ({
  EMBEDDING_DIMENSIONS: 3072,
  generateEmbeddingBatch: (...a: unknown[]) => generateEmbeddingBatch(...a),
}));
jest.mock("@/lib/ai/googleAI", () => ({
  GOOGLE_AI_MODELS: { embedding: "gemini-embedding-001" },
  hasGoogleAiApiKey: () => true,
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import {
  clearSkillVectorMemo,
  decodeStoredSkillVector,
  encodeSkillVector,
  loadSkillVectors,
} from "@/lib/matching/skillVectors";
import { cosine, SKILL_VECTOR_DIMENSIONS, toSkillVector } from "@/lib/matching/skillSimilarity";

const FULL = 3072;
const norm = (v: readonly number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
const unit768 = (seed: number) => {
  const raw = Array.from({ length: SKILL_VECTOR_DIMENSIONS }, (_, i) => Math.sin(seed + i));
  const n = norm(raw);
  return raw.map((x) => x / n);
};
const rows = (list: unknown[]) => find.mockReturnValue({ select: () => ({ lean: async () => list }) });

beforeEach(() => {
  clearSkillVectorMemo();
  find.mockReset();
  bulkWrite.mockClear();
  generateEmbeddingBatch.mockReset();
});

describe("encode/decode", () => {
  it("round-trips a 768-dim vector through 3,072 bytes of little-endian float32", () => {
    const v = unit768(1);
    const bytes = encodeSkillVector(v);
    expect(bytes).toHaveLength(SKILL_VECTOR_DIMENSIONS * 4);
    const back = decodeStoredSkillVector(bytes);
    expect(back).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    back!.forEach((x, i) => expect(x).toBeCloseTo(v[i], 6));
  });

  it("decodes the driver's Binary the way lean() returns it", () => {
    const v = unit768(2);
    const back = decodeStoredSkillVector(new mongoose.mongo.Binary(encodeSkillVector(v)));
    expect(back).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    expect(back![5]).toBeCloseTo(v[5], 6);
  });

  it("truncates and renormalizes a legacy 3,072-number array", () => {
    const back = decodeStoredSkillVector(Array.from({ length: FULL }, () => 1));
    expect(back).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    expect(norm(back!)).toBeCloseTo(1, 9);
  });

  it("rejects anything else", () => {
    expect(decodeStoredSkillVector(Array.from({ length: 512 }, () => 1))).toBeNull();
    expect(decodeStoredSkillVector(Buffer.alloc(100))).toBeNull();
    expect(decodeStoredSkillVector(Buffer.alloc(SKILL_VECTOR_DIMENSIONS * 4 - 4))).toBeNull();
    expect(decodeStoredSkillVector(Buffer.alloc(SKILL_VECTOR_DIMENSIONS * 8))).toBeNull();
    expect(decodeStoredSkillVector(undefined)).toBeNull();
    expect(decodeStoredSkillVector("nope")).toBeNull();
  });

  it("reads corrupt bytes or a broken legacy array as absent, so the skill is embedded again", () => {
    expect(decodeStoredSkillVector(Buffer.alloc(SKILL_VECTOR_DIMENSIONS * 4))).toBeNull(); // all zero
    expect(decodeStoredSkillVector(Buffer.alloc(SKILL_VECTOR_DIMENSIONS * 4, 0xff))).toBeNull(); // all NaN
    const legacyNaN = Array.from({ length: FULL }, () => 1);
    legacyNaN[10] = NaN;
    expect(decodeStoredSkillVector(legacyNaN)).toBeNull();
    expect(decodeStoredSkillVector(new Array(FULL).fill(0))).toBeNull();
  });

  it("survives a real BSON round trip, where the bytes sit at an unaligned offset", () => {
    const BSON = mongoose.mongo.BSON;
    const v = unit768(5);
    const legacy = Array.from({ length: FULL }, (_, i) => Math.cos(i / 3));
    for (const pad of [0, 1, 2, 3, 37]) {
      const doc = BSON.deserialize(BSON.serialize({ pad: "y".repeat(pad), vector: encodeSkillVector(v), old: legacy }));
      const back = decodeStoredSkillVector(doc.vector);
      expect(back).toHaveLength(SKILL_VECTOR_DIMENSIONS);
      back!.forEach((x, i) => expect(x).toBeCloseTo(v[i], 6));
      expect(decodeStoredSkillVector(doc.old)).toEqual(toSkillVector(legacy));
    }
  });

  it("scores a legacy row and its rewritten form the same", () => {
    const full = Array.from({ length: FULL }, (_, i) => Math.sin(i / 7) + 0.1);
    const other = unit768(6);
    const fromLegacy = decodeStoredSkillVector(full)!;
    const bytes = encodeSkillVector(toSkillVector(full)!);
    const fromBytes = decodeStoredSkillVector(bytes)!;
    expect(Math.abs(cosine(fromLegacy, other) - cosine(fromBytes, other))).toBeLessThan(1e-6);
    expect(encodeSkillVector(fromBytes).equals(bytes)).toBe(true);
  });
});

describe("loadSkillVectors", () => {
  it("reads a float32 row and a legacy array row, and writes nothing", async () => {
    const react = unit768(3);
    rows([
      { canonical: "react", vector: new mongoose.mongo.Binary(encodeSkillVector(react)), dims: SKILL_VECTOR_DIMENSIONS },
      { canonical: "vue", vector: Array.from({ length: FULL }, (_, i) => (i % 5) - 2), dims: FULL },
    ]);
    const map = await loadSkillVectors(["React", "Vue"]);
    expect(map.get("react")).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    expect(map.get("react")![9]).toBeCloseTo(react[9], 6);
    expect(map.get("vue")).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    expect(norm(map.get("vue")!)).toBeCloseTo(1, 9);
    expect(generateEmbeddingBatch).not.toHaveBeenCalled();
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("embeds a missing skill and stores it as 768 float32 dims", async () => {
    rows([]);
    generateEmbeddingBatch.mockResolvedValue([Array.from({ length: FULL }, (_, i) => Math.cos(i))]);
    const map = await loadSkillVectors(["Kubernetes"]);
    expect(map.get("kubernetes")).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    expect(norm(map.get("kubernetes")!)).toBeCloseTo(1, 9);

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const [ops] = bulkWrite.mock.calls[0] as unknown as [Array<{ updateOne: { filter: unknown; update: { $set: Record<string, unknown> } } }>];
    const set = ops[0].updateOne.update.$set;
    expect(ops[0].updateOne.filter).toEqual({ canonical: "kubernetes" });
    expect(Buffer.isBuffer(set.vector)).toBe(true);
    expect((set.vector as Buffer).length).toBe(SKILL_VECTOR_DIMENSIONS * 4);
    expect(set.dims).toBe(SKILL_VECTOR_DIMENSIONS);
    expect(set.embeddingModel).toBe("gemini-embedding-001");
  });

  it("drops an embedding of the wrong size instead of storing it", async () => {
    rows([]);
    generateEmbeddingBatch.mockResolvedValue([Array.from({ length: 1536 }, () => 1)]);
    const map = await loadSkillVectors(["Terraform"]);
    expect(map.has("terraform")).toBe(false);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("treats a row of an unexpected size as absent", async () => {
    rows([{ canonical: "go", vector: Array.from({ length: 512 }, () => 1), dims: 512 }]);
    const map = await loadSkillVectors(["Go"], { allowEmbedding: false });
    expect(map.has("go")).toBe(false);
  });

  it("serves a repeat lookup from memory without another read", async () => {
    rows([{ canonical: "react", vector: new mongoose.mongo.Binary(encodeSkillVector(unit768(4))), dims: SKILL_VECTOR_DIMENSIONS }]);
    await loadSkillVectors(["React"]);
    expect(find).toHaveBeenCalledTimes(1);
    const again = await loadSkillVectors(["react"]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(again.get("react")).toHaveLength(SKILL_VECTOR_DIMENSIONS);
  });

  it("embeds only the skill that is missing from a mixed batch", async () => {
    rows([
      { canonical: "react", vector: new mongoose.mongo.Binary(encodeSkillVector(unit768(7))) },
      { canonical: "vue", vector: Array.from({ length: FULL }, (_, i) => (i % 3) - 1) },
    ]);
    generateEmbeddingBatch.mockResolvedValue([Array.from({ length: FULL }, (_, i) => Math.sin(i))]);
    const map = await loadSkillVectors(["React", "Vue", "Kubernetes"]);
    expect([...map.keys()].sort()).toEqual(["kubernetes", "react", "vue"]);
    expect(generateEmbeddingBatch).toHaveBeenCalledTimes(1);
    expect(generateEmbeddingBatch).toHaveBeenCalledWith(["Kubernetes"]);
    const [ops] = bulkWrite.mock.calls[0] as unknown as [Array<{ updateOne: { filter: unknown } }>];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter).toEqual({ canonical: "kubernetes" });
  });

  it("re-embeds and overwrites a row it cannot read", async () => {
    rows([{ canonical: "go", vector: Buffer.alloc(SKILL_VECTOR_DIMENSIONS * 4) }]);
    generateEmbeddingBatch.mockResolvedValue([Array.from({ length: FULL }, (_, i) => Math.cos(i))]);
    const map = await loadSkillVectors(["Go"]);
    expect(map.get("go")).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    expect(generateEmbeddingBatch).toHaveBeenCalledWith(["Go"]);
    const [ops] = bulkWrite.mock.calls[0] as unknown as [Array<{ updateOne: { filter: unknown } }>];
    expect(ops[0].updateOne.filter).toEqual({ canonical: "go" });
  });
});
