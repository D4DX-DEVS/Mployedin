import type { JevVerdictStore } from "@/lib/matching/recommend";

type BatchableStore = JevVerdictStore & { getMany: NonNullable<JevVerdictStore["getMany"]> };

/**
 * Collect every `get()` made in the same tick and answer them with one
 * `getMany()`. `scoreSeekerPool` scores the whole pool with Promise.all, so
 * without this a page render made one Mongo round trip per in-band job.
 * Create one per request; it holds no state between batches.
 */
export function batchVerdictReads(store: BatchableStore): JevVerdictStore {
  let queue: Array<{ input: unknown; resolve: (fit: number | null) => void; reject: (err: unknown) => void }> = [];

  const flush = async () => {
    const batch = queue;
    queue = [];
    try {
      const fits = await store.getMany(batch.map((item) => item.input));
      batch.forEach((item, i) => item.resolve(fits[i] ?? null));
    } catch (err) {
      batch.forEach((item) => item.reject(err));
    }
  };

  return {
    get(input) {
      return new Promise((resolve, reject) => {
        queue.push({ input, resolve, reject });
        if (queue.length === 1) setTimeout(() => void flush(), 0);
      });
    },
    set: (input, fit) => store.set(input, fit),
    getMany: (inputs) => store.getMany(inputs),
  };
}
