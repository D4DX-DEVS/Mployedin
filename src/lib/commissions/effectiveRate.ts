/**
 * Picks the commission rate that applies on a date from an effective-dated,
 * append-only list of changes (models/rateHistory). The latest change whose
 * `effectiveFrom` is on or before the date wins; when two start the same day,
 * the one set last wins. Returns null when nothing applies yet.
 */

export interface DatedRate {
  rate: number;
  effectiveFrom: Date | string;
  setAt?: Date | string;
}

function time(value: Date | string | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function effectiveRate(history: readonly DatedRate[] | null | undefined, on: Date): number | null {
  if (!history?.length) return null;
  const at = on.getTime();
  let best: DatedRate | null = null;
  for (const change of history) {
    const from = time(change.effectiveFrom);
    if (from > at) continue;
    if (
      !best ||
      from > time(best.effectiveFrom) ||
      (from === time(best.effectiveFrom) && time(change.setAt) >= time(best.setAt))
    ) {
      best = change;
    }
  }
  return best ? best.rate : null;
}
