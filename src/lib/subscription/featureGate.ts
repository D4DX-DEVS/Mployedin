/**
 * Utility for checking feature gates inside route handlers
 * (as opposed to the middleware wrapper).
 *
 * Usage:
 *   const gate = await checkFeatureGate(userId, { type: "ai", feature: "ai_chat" });
 *   if (!gate.allowed) return NextResponse.json({ error: gate.reason }, { status: 403 });
 */

import { NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import type { FeatureCheck } from "./withSubscription";
import {
  isInGracePeriod,
  getGracePeriodEmployerLimits,
  getGracePeriodJobSeekerLimits,
} from "./gracePeriod";

export interface FeatureGateResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  used?: number;
  remaining?: number;
}

/**
 * Check if a specific feature is allowed for a user.
 * Does NOT increment usage — use this for read-only checks.
 */
export async function checkFeatureGate(
  userId: string,
  check: FeatureCheck,
  targetRole?: "employer" | "job_seeker",
): Promise<FeatureGateResult> {
  await connectDB();

  const role = targetRole ?? "employer"; // caller should provide

  const sub = await Subscription.findOne({
    userId,
    targetRole: role,
    status: "active",
  }).lean();

  // If no subscription, check grace period
  if (!sub) {
    const inGrace = await isInGracePeriod(userId);
    if (inGrace) {
      // Grace period: allow all features (Gold-tier equivalent)
      return { allowed: true };
    }
    return { allowed: false, reason: "SUBSCRIPTION_REQUIRED" };
  }

  const snapshot = sub.planSnapshot;
  const limits =
    role === "employer"
      ? snapshot?.employerLimits
      : snapshot?.jobSeekerLimits;

  if (!limits) {
    return { allowed: false, reason: "SUBSCRIPTION_REQUIRED" };
  }

  // ── AI Feature ─────────────────────────────────────────────────────────
  if (check.type === "ai") {
    const aiFeatures = (limits as Record<string, unknown>).aiFeatures as
      Array<{ feature: string; enabled: boolean; monthlyLimit: number }> | undefined;
    const cfg = aiFeatures?.find((f) => f.feature === check.feature);

    if (!cfg || !cfg.enabled) {
      return { allowed: false, reason: "FEATURE_DISABLED" };
    }

    if (cfg.monthlyLimit > 0) {
      const used = (sub.usage?.aiUsage as Record<string, number>)?.[check.feature] ?? 0;
      const remaining = Math.max(0, cfg.monthlyLimit - used);
      if (used >= cfg.monthlyLimit) {
        return {
          allowed: false,
          reason: "LIMIT_EXCEEDED",
          limit: cfg.monthlyLimit,
          used,
          remaining: 0,
        };
      }
      return { allowed: true, limit: cfg.monthlyLimit, used, remaining };
    }

    return { allowed: true }; // unlimited
  }

  // ── Numeric Limit ──────────────────────────────────────────────────────
  if (check.type === "limit") {
    const limitsObj = limits as Record<string, unknown>;
    const limitMap: Record<string, { max: number; current: number }> = {
      activeJobs: {
        max: (limitsObj.maxActiveJobs as number) ?? -1,
        current: sub.usage?.activeJobs ?? 0,
      },
      applicationsViewed: {
        max: (limitsObj.maxApplicationsViewPerMonth as number) ?? -1,
        current: sub.usage?.applicationsViewed ?? 0,
      },
      applicationsSubmitted: {
        max: (limitsObj.maxApplicationsPerMonth as number) ?? -1,
        current: sub.usage?.applicationsSubmitted ?? 0,
      },
      teamMembers: {
        max: (limitsObj.maxTeamMembers as number) ?? -1,
        current: 0,
      },
    };

    const entry = limitMap[check.feature];
    if (!entry) return { allowed: true };

    if (entry.max === -1) {
      return { allowed: true }; // unlimited
    }

    const remaining = Math.max(0, entry.max - entry.current);
    if (entry.current >= entry.max) {
      return {
        allowed: false,
        reason: "LIMIT_EXCEEDED",
        limit: entry.max,
        used: entry.current,
        remaining: 0,
      };
    }

    return { allowed: true, limit: entry.max, used: entry.current, remaining };
  }

  // ── Boolean Toggle ─────────────────────────────────────────────────────
  if (check.type === "toggle") {
    const value = (limits as Record<string, unknown>)[check.feature];
    if (!value) {
      return { allowed: false, reason: "FEATURE_DISABLED" };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

// ── Bypass roles — admin/super_agent/agent never gated ───────────────────────
const BYPASS_ROLES = new Set(["admin", "super_agent", "agent"]);

/**
 * Check feature gate AND atomically increment usage for AI features.
 * Returns a NextResponse error if blocked, or null if allowed.
 *
 * Use inside any route handler (works with both withAuth and manual auth).
 */
export async function enforceFeatureGate(
  userId: string,
  role: string,
  check: FeatureCheck,
): Promise<NextResponse | null> {
  // Admin/agent roles bypass all subscription gates
  if (BYPASS_ROLES.has(role)) return null;

  const targetRole = role === "employer" ? "employer" : "job_seeker";
  const gate = await checkFeatureGate(userId, check, targetRole as "employer" | "job_seeker");

  if (!gate.allowed) {
    const status = gate.reason === "LIMIT_EXCEEDED" ? 429 : 403;
    return NextResponse.json(
      {
        error: gate.reason,
        message:
          gate.reason === "SUBSCRIPTION_REQUIRED"
            ? "An active subscription is required to use this feature"
            : gate.reason === "LIMIT_EXCEEDED"
              ? `Monthly limit reached for this feature`
              : `This feature is not available in your plan`,
        ...(gate.limit !== undefined && { limit: gate.limit, used: gate.used }),
      },
      { status },
    );
  }

  // Atomically increment usage for AI features
  if (check.type === "ai") {
    await Subscription.findOneAndUpdate(
      { userId, targetRole, status: "active" },
      { $inc: { [`usage.aiUsage.${check.feature}`]: 1 } },
    );
  }

  return null; // allowed
}

/**
 * Get full feature gate map for a user — used by the feature-gate API route.
 */
export async function getFeatureGateMap(
  userId: string,
  targetRole: "employer" | "job_seeker",
): Promise<Record<string, { allowed: boolean; limit?: number; used?: number; remaining?: number }>> {
  await connectDB();

  const sub = await Subscription.findOne({
    userId,
    targetRole,
    status: "active",
  }).lean();

  if (!sub) {
    // Grace period: return a full "allowed" map based on Gold/Premium-tier limits
    const inGrace = await isInGracePeriod(userId);
    if (inGrace) {
      const graceLimits = targetRole === "employer"
        ? getGracePeriodEmployerLimits()
        : getGracePeriodJobSeekerLimits();
      return buildGateMapFromLimits(graceLimits, targetRole);
    }
    return {};
  }

  const snapshot = sub.planSnapshot;
  const limits =
    targetRole === "employer"
      ? snapshot?.employerLimits
      : snapshot?.jobSeekerLimits;

  if (!limits) return {};

  const result: Record<string, { allowed: boolean; limit?: number; used?: number; remaining?: number }> = {};

  // AI features
  const aiFeatures = (limits as Record<string, unknown>).aiFeatures as
    Array<{ feature: string; enabled: boolean; monthlyLimit: number }> | undefined;

  if (aiFeatures) {
    for (const f of aiFeatures) {
      const used = (sub.usage?.aiUsage as Record<string, number>)?.[f.feature] ?? 0;
      const limit = f.monthlyLimit;
      const remaining = limit > 0 ? Math.max(0, limit - used) : undefined;
      result[f.feature] = {
        allowed: f.enabled && (limit === 0 || used < limit),
        limit: limit > 0 ? limit : undefined,
        used: limit > 0 ? used : undefined,
        remaining,
      };
    }
  }

  // Numeric limits
  const limitsObj = limits as Record<string, unknown>;
  const numericMap: Record<string, { maxKey: string; usageKey: string }> = {
    activeJobs: { maxKey: "maxActiveJobs", usageKey: "activeJobs" },
    applicationsViewed: { maxKey: "maxApplicationsViewPerMonth", usageKey: "applicationsViewed" },
    applicationsSubmitted: { maxKey: "maxApplicationsPerMonth", usageKey: "applicationsSubmitted" },
    teamMembers: { maxKey: "maxTeamMembers", usageKey: "" },
  };

  for (const [key, { maxKey, usageKey }] of Object.entries(numericMap)) {
    const max = limitsObj[maxKey] as number | undefined;
    if (max === undefined) continue;
    const used = usageKey ? ((sub.usage as Record<string, number>)?.[usageKey] ?? 0) : 0;
    const unlimited = max === -1;
    result[key] = {
      allowed: unlimited || used < max,
      limit: unlimited ? undefined : max,
      used: unlimited ? undefined : used,
      remaining: unlimited ? undefined : Math.max(0, max - used),
    };
  }

  // Boolean toggles
  const toggleKeys = [
    "dataExport", "commTemplates", "scorecardEvaluations",
    "matchingWeightCustomization", "workflowCustomization",
    "prioritySupport", "brandedCompanyPage",
    "profileVisibilityBoost", "salaryInsights",
    "priorityApplicationReview", "resumeBuilderAccess",
  ];

  for (const key of toggleKeys) {
    if (key in limitsObj) {
      result[key] = { allowed: !!limitsObj[key] };
    }
  }

  // Analytics level
  if ("analyticsLevel" in limitsObj) {
    result.analyticsLevel = {
      allowed: limitsObj.analyticsLevel !== "none",
    };
  }

  return result;
}

// ── Grace period helper ──────────────────────────────────────────────────────

function buildGateMapFromLimits(
  limits: Record<string, unknown>,
  targetRole: "employer" | "job_seeker",
): Record<string, { allowed: boolean; limit?: number; used?: number; remaining?: number }> {
  const result: Record<string, { allowed: boolean; limit?: number; used?: number; remaining?: number }> = {};

  // AI features
  const aiFeatures = limits.aiFeatures as
    Array<{ feature: string; enabled: boolean; monthlyLimit: number }> | undefined;
  if (aiFeatures) {
    for (const f of aiFeatures) {
      result[f.feature] = {
        allowed: f.enabled,
        limit: f.monthlyLimit > 0 ? f.monthlyLimit : undefined,
        used: 0,
        remaining: f.monthlyLimit > 0 ? f.monthlyLimit : undefined,
      };
    }
  }

  // Numeric limits
  const numericMap: Record<string, string> = targetRole === "employer"
    ? { activeJobs: "maxActiveJobs", applicationsViewed: "maxApplicationsViewPerMonth", teamMembers: "maxTeamMembers" }
    : { applicationsSubmitted: "maxApplicationsPerMonth" };

  for (const [key, maxKey] of Object.entries(numericMap)) {
    const max = limits[maxKey] as number | undefined;
    if (max === undefined) continue;
    const unlimited = max === -1;
    result[key] = {
      allowed: true,
      limit: unlimited ? undefined : max,
      used: 0,
      remaining: unlimited ? undefined : max,
    };
  }

  // Boolean toggles
  const toggleKeys = [
    "dataExport", "commTemplates", "scorecardEvaluations",
    "matchingWeightCustomization", "workflowCustomization",
    "prioritySupport", "brandedCompanyPage",
    "profileVisibilityBoost", "salaryInsights",
    "priorityApplicationReview", "resumeBuilderAccess",
  ];
  for (const key of toggleKeys) {
    if (key in limits) {
      result[key] = { allowed: !!limits[key] };
    }
  }

  // Analytics level
  if ("analyticsLevel" in limits) {
    result.analyticsLevel = { allowed: limits.analyticsLevel !== "none" };
  }

  return result;
}
