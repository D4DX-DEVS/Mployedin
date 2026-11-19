/**
 * Shared rules for an employer's agent commission rate
 * (Employer.agentCommissionRates, append-only and effective-dated), used by the
 * admin, super agent and agent `/employers/[id]/agent-rate` routes.
 *
 * - The current rate is the one in effect today (lib/commissions/effectiveRate),
 *   not simply the newest entry: a future-dated change is "upcoming".
 * - Admin overrides lock super agents out (owner rule): while the rate in effect
 *   was set by admin, or any admin-set rate is still to come, a super agent
 *   cannot add a change.
 * - Changes are appended with `$push`; existing entries are never edited.
 */

import mongoose from "mongoose";
import { z } from "zod";
import { effectiveRate } from "./effectiveRate";

export interface StoredRateChange {
  rate: number;
  effectiveFrom: Date | string;
  setBy?: unknown;
  setByRole?: "admin" | "super_agent" | string;
  reason?: string;
  setAt?: Date | string;
}

export const setEmployerRateSchema = z.object({
  rate: z.number().min(0).max(100).refine((v) => Math.round(v * 100) === v * 100, "At most two decimals"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Invalid date"),
  reason: z.string().trim().min(1, "Give a reason").max(500),
});

export type SetEmployerRateInput = z.infer<typeof setEmployerRateSchema>;

const time = (v: Date | string | undefined) => (v ? new Date(v).getTime() : 0);

function newestFirst(a: StoredRateChange, b: StoredRateChange): number {
  return time(b.effectiveFrom) - time(a.effectiveFrom) || time(b.setAt) - time(a.setAt);
}

/** The entry in effect at `now` (latest start on or before it; ties → set last). */
export function entryInEffect(history: readonly StoredRateChange[], now: Date): StoredRateChange | null {
  const started = history.filter((h) => time(h.effectiveFrom) <= now.getTime());
  return started.length ? [...started].sort(newestFirst)[0] : null;
}

export interface EmployerRateView {
  history: StoredRateChange[];
  current: { rate: number; source: "employer_rate"; effectiveFrom: Date | string; setByRole?: string } | { source: "none" };
  upcoming: StoredRateChange[];
  lockedByAdmin: boolean;
}

export function employerRateView(history: readonly StoredRateChange[] | null | undefined, now: Date = new Date()): EmployerRateView {
  const list = [...(history ?? [])].sort(newestFirst);
  const inEffect = entryInEffect(list, now);
  const rate = effectiveRate(list, now);
  return {
    history: list,
    current:
      inEffect && rate !== null
        ? { rate, source: "employer_rate", effectiveFrom: inEffect.effectiveFrom, setByRole: inEffect.setByRole }
        : { source: "none" },
    upcoming: list.filter((h) => time(h.effectiveFrom) > now.getTime()),
    lockedByAdmin: isLockedByAdmin(list, now),
  };
}

/** True while the rate in effect is admin's, or an admin-set rate is still to come. */
export function isLockedByAdmin(history: readonly StoredRateChange[], now: Date = new Date()): boolean {
  if (entryInEffect(history, now)?.setByRole === "admin") return true;
  return history.some((h) => h.setByRole === "admin" && time(h.effectiveFrom) > now.getTime());
}

/** Append one change; never rewrites the list. Returns false when the employer is gone. */
export async function appendEmployerRate(
  employerId: mongoose.Types.ObjectId | string,
  input: SetEmployerRateInput,
  actor: { userId: string; role: "admin" | "super_agent" },
): Promise<boolean> {
  const { default: Employer } = await import("@/models/Employer");
  const res = await Employer.updateOne(
    { _id: employerId },
    {
      $push: {
        agentCommissionRates: {
          rate: input.rate,
          effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
          setBy: new mongoose.Types.ObjectId(actor.userId),
          setByRole: actor.role,
          reason: input.reason,
          setAt: new Date(),
        },
      },
    },
  );
  return res.matchedCount > 0;
}
