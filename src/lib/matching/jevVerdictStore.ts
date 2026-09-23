/**
 * The Mongo-backed JevVerdictStore every server surface passes to the engine.
 *
 * Kept out of recommend.ts so that module stays free of Mongoose and unit
 * testable without a database — the engine only knows the interface.
 */
import { createHash } from "node:crypto";
import JevVerdict from "@/models/JevVerdict";
import type { JevVerdictStore } from "@/lib/matching/recommend";

/**
 * How long a verdict is trusted. Far longer than a job usually stays open, so
 * in practice a verdict is retired by its inputs changing, not by age — the TTL
 * only stops abandoned pairs piling up.
 */
const VERDICT_TTL_DAYS = 30;

/**
 * JSON with object keys sorted, so equal inputs always hash equally whatever
 * order their fields were assigned in. Arrays keep their order: a reordered
 * skills list is a different thing to show Jev.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function verdictKey(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export const mongoJevVerdictStore: JevVerdictStore = {
  async get(input) {
    const doc = await JevVerdict.findOne({ key: verdictKey(input) }).select("fit").lean();
    return typeof doc?.fit === "number" ? doc.fit : null;
  },
  async set(input, fit) {
    const expiresAt = new Date(Date.now() + VERDICT_TTL_DAYS * 24 * 60 * 60 * 1000);
    // Upsert: two surfaces deciding the same pair at once must converge, not
    // fail on the unique index.
    await JevVerdict.updateOne(
      { key: verdictKey(input) },
      { $set: { fit, expiresAt } },
      { upsert: true },
    );
  },
};
