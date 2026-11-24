/**
 * Invoice lines carry the hire they bill (`lineItems[].placementId`), so
 * revenue and conversions can be credited per hire even when one invoice bills
 * several (lib/targets/kpiCalculator).
 *
 * - A line that names a placement must name one of the job's own placements.
 * - When no line names one, the invoice has exactly one fee line and the job
 *   has exactly one placement, that fee line is linked to it. Anything else
 *   stays unlinked for an admin to link from the invoices page.
 * - "other" lines (visa, transport) are never fee lines and never linked.
 */

import mongoose from "mongoose";

export interface PlacementLine {
  jobId?: unknown;
  placementId?: unknown;
  chargeType?: "placement" | "other";
}

/** A fee for a hire: everything except an "other" charge. */
export function isFeeLine(line: { chargeType?: string | null }): boolean {
  return line.chargeType !== "other";
}

export type LinkResult<T> = { lines: T[] } | { error: string };

export async function linkLinePlacements<T extends PlacementLine>(
  jobId: string,
  lines: T[],
  loadPlacementIds: (jobIds: string[]) => Promise<{ _id: unknown; jobId: unknown }[]> = defaultLoad,
): Promise<LinkResult<T>> {
  const jobIds = [...new Set([jobId, ...lines.map((l) => (l.jobId ? String(l.jobId) : jobId))])];
  const placements = await loadPlacementIds(jobIds);
  const jobOf = new Map(placements.map((p) => [String(p._id), String(p.jobId)]));

  for (const line of lines) {
    if (!line.placementId) continue;
    const owner = jobOf.get(String(line.placementId));
    if (!owner || owner !== String(line.jobId ?? jobId)) {
      return { error: "A line names a hire that is not on this job." };
    }
  }

  const named = lines.some((l) => l.placementId);
  const forJob = placements.filter((p) => String(p.jobId) === jobId);
  const feeIndexes = lines.flatMap((l, i) => (isFeeLine(l) ? [i] : []));
  if (!named && feeIndexes.length === 1 && forJob.length === 1) {
    const at = feeIndexes[0];
    return { lines: lines.map((l, i) => (i === at ? { ...l, placementId: forJob[0]._id } : l)) };
  }
  return { lines };
}

async function defaultLoad(jobIds: string[]): Promise<{ _id: unknown; jobId: unknown }[]> {
  const { default: Placement } = await import("@/models/Placement");
  const ids = jobIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  return Placement.find({ jobId: { $in: ids } }).select("_id jobId").lean();
}

/**
 * Revenue and commission base (owner rule, 2026-11-18): the invoice total minus
 * tax — the discount is taken off and the service charge stays in.
 */
export function commissionBase(discountedSubtotal: number, serviceCharge: number): number {
  return Math.round(((discountedSubtotal || 0) + (serviceCharge || 0)) * 100) / 100;
}
