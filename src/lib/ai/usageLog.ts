/**
 * Records AI usage: reads the provider's `usage` block, prices it, and writes
 * one AiUsageLog row plus the monthly rollups.
 *
 * Logging must never break or slow an AI call, so every failure here is
 * swallowed (and counted in the log line), and the response body is read from a
 * clone, in the background.
 */
import mongoose from "mongoose";
import logger from "@/lib/logger";
import { connectDB } from "@/lib/db/mongoose";
import AiUsageLog from "@/models/AiUsageLog";
import AiUsageMonthly from "@/models/AiUsageMonthly";
import Employer from "@/models/Employer";
import { computeCost } from "./pricing";
import { featureFromPath, getAiCaller, type AiCaller } from "./usageContext";
import type { ExtractedUsage } from "./usageCapture";

const RETENTION_DAYS = 180;

export { extractUsage, extractUsageFromSse, modelFromRequest, providerFromUrl, type ExtractedUsage } from "./usageCapture";

export interface RecordInput {
  usage: ExtractedUsage;
  model: string;
  provider: string;
  ok: boolean;
  latencyMs?: number;
  label?: string;
  cacheHit?: boolean;
  /** Overrides the context's caller (cron and scripts). */
  caller?: AiCaller;
}

const employerIdCache = new Map<string, string | null>();

async function employerIdForOwner(ownerUserId: string): Promise<string | null> {
  if (employerIdCache.has(ownerUserId)) return employerIdCache.get(ownerUserId) ?? null;
  const emp = await Employer.findOne({ userId: ownerUserId }).select("_id").lean();
  const id = emp ? String(emp._id) : null;
  if (employerIdCache.size > 5000) employerIdCache.clear();
  employerIdCache.set(ownerUserId, id);
  return id;
}

function oid(id: string | null | undefined): mongoose.Types.ObjectId | null {
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

function utcMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Write one usage row and update the rollups. Never throws. */
export async function recordAiUsage(input: RecordInput): Promise<void> {
  try {
    const caller = input.caller ?? getAiCaller() ?? { role: "system" };
    const { costUsd, priced } = computeCost({
      model: input.model,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      reportedCostUsd: input.cacheHit ? 0 : input.usage.costUsd,
    });
    const now = new Date();
    const feature = caller.feature ?? featureFromPath(caller.route) ?? "other";

    await connectDB();
    const employerId =
      caller.employerId ?? (caller.employerUserId ? await employerIdForOwner(caller.employerUserId) : null);
    const userObjectId = oid(caller.userId);
    const employerObjectId = oid(employerId);
    const onBehalf = Boolean(caller.onBehalf && employerObjectId);

    await AiUsageLog.create({
      at: now,
      userId: userObjectId,
      role: caller.role,
      employerId: employerObjectId,
      onBehalf,
      feature,
      provider: input.provider,
      modelId: input.model,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      costUsd,
      priced,
      cacheHit: Boolean(input.cacheHit),
      ok: input.ok,
      latencyMs: input.latencyMs,
      route: caller.route,
      expiresAt: new Date(now.getTime() + RETENTION_DAYS * 24 * 3600 * 1000),
    });

    const month = utcMonth(now);
    const inc = {
      calls: 1,
      failed: input.ok ? 0 : 1,
      cacheHits: input.cacheHit ? 1 : 0,
      unpriced: priced ? 0 : 1,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      costUsd,
    };
    const ops: Promise<unknown>[] = [];
    if (employerObjectId) {
      ops.push(
        AiUsageMonthly.updateOne(
          { month, scope: "employer", refId: employerObjectId, feature },
          { $inc: inc },
          { upsert: true },
        ),
      );
    }
    if (userObjectId) {
      ops.push(
        AiUsageMonthly.updateOne(
          { month, scope: "user", refId: userObjectId, feature },
          {
            $inc: { ...inc, behalfCalls: onBehalf ? 1 : 0, behalfCostUsd: onBehalf ? costUsd : 0 },
            $set: { role: caller.role },
            ...(onBehalf && employerObjectId ? { $addToSet: { employerIds: employerObjectId } } : {}),
          },
          { upsert: true },
        ),
      );
    }
    await Promise.all(ops);
  } catch (err) {
    logger.warn({ err, label: input.label }, "[ai-usage] could not record usage");
  }
}
