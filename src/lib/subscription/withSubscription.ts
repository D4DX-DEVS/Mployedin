/**
 * Server-side subscription feature gating middleware.
 *
 * Use AFTER withAuth() — it reads the authenticated user's active subscription
 * and checks whether the requested feature is allowed + within limits.
 *
 * Example:
 *   const inner = withSubscription(handler, { type: "ai", feature: "ai_cv_extraction" });
 *   export const POST = withAuth(inner, { resource: "ai_cv", action: "read" });
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import type { UserRole } from "@/types/user";
import type { AIFeatureKey } from "@/models/SubscriptionPlan";
import { isSubscriptionEnforcementEnabled } from "./enforcementFlag";
import { isInGracePeriod } from "./gracePeriod";
import { isLimitFeatureForRole, isToggleEnabled } from "./helpers";

// ── Feature check types ──────────────────────────────────────────────────────

export type FeatureCheck =
  | { type: "ai"; feature: AIFeatureKey }
  | { type: "limit"; feature: "activeJobs" | "applicationsViewed" | "applicationsSubmitted" | "teamMembers" }
  | { type: "toggle"; feature: string };

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

// Roles that bypass subscription checks
const BYPASS_ROLES: UserRole[] = ["admin", "super_agent", "agent"];

/**
 * Wrap a route handler with subscription-based feature gating.
 * Returns a handler with the same signature as withAuth expects.
 */
export function withSubscription(
  handler: (req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) => Promise<NextResponse>,
  check: FeatureCheck,
) {
  return async (req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) => {
    // Admin/agent roles are never gated
    if (BYPASS_ROLES.includes(ctx.role)) {
      return handler(req, ctx, params);
    }

    // Subscription enforcement is toggled globally by an admin. While it is OFF
    // (default, until payment integration is live) all users get full access.
    if (!(await isSubscriptionEnforcementEnabled())) {
      return handler(req, ctx, params);
    }

    await connectDB();

    const targetRole = ctx.role === "employer" ? "employer" : "job_seeker";

    // Find active subscription
    const sub = await Subscription.findOne({
      userId: ctx.userId,
      targetRole,
      status: "active",
    });

    // If no subscription, check grace period (30 days from signup → Gold-tier access)
    if (!sub) {
      const inGrace = await isInGracePeriod(ctx.userId);
      if (inGrace) {
        // Grace period: allow with Gold-tier limits (no usage tracking)
        return handler(req, ctx, params);
      }
      return NextResponse.json(
        { error: "SUBSCRIPTION_REQUIRED", message: "An active subscription is required to use this feature" },
        { status: 403 },
      );
    }

    const snapshot = sub.planSnapshot;
    const limits =
      targetRole === "employer"
        ? snapshot?.employerLimits
        : snapshot?.jobSeekerLimits;

    if (!limits) {
      return NextResponse.json(
        { error: "SUBSCRIPTION_REQUIRED", message: "Subscription plan has no feature limits configured" },
        { status: 403 },
      );
    }

    // ── AI Feature Check ─────────────────────────────────────────────────
    if (check.type === "ai") {
      const aiFeatures = limits.aiFeatures ?? [];
      const featureCfg = aiFeatures.find(
        (f: { feature: string; enabled: boolean; monthlyLimit: number }) =>
          f.feature === check.feature,
      );

      if (!featureCfg || !featureCfg.enabled) {
        return NextResponse.json(
          {
            error: "FEATURE_DISABLED",
            message: `Feature "${check.feature}" is not available in your plan`,
            feature: check.feature,
          },
          { status: 403 },
        );
      }

      const usagePath = `usage.aiUsage.${check.feature}`;
      const reserveFilter: Record<string, unknown> = { _id: sub._id };
      if (featureCfg.monthlyLimit > 0) {
        reserveFilter.$expr = {
          $lt: [{ $ifNull: [`$${usagePath}`, 0] }, featureCfg.monthlyLimit],
        };
      }

      // Reserve one unit in the same atomic operation that checks the boundary.
      // This prevents parallel requests from all passing a stale read.
      const reserved = await Subscription.findOneAndUpdate(
        reserveFilter,
        { $inc: { [usagePath]: 1 } },
        { new: true },
      );

      if (!reserved) {
        const used = sub.usage?.aiUsage?.[check.feature] ?? featureCfg.monthlyLimit;
        return NextResponse.json(
          {
            error: "LIMIT_EXCEEDED",
            message: `Monthly limit reached for "${check.feature}"`,
            feature: check.feature,
            limit: featureCfg.monthlyLimit,
            used,
          },
          { status: 429 },
        );
      }

      try {
        const response = await handler(req, ctx, params);
        if (response.status < 200 || response.status >= 300) {
          await Subscription.updateOne(
            { _id: sub._id, [usagePath]: { $gt: 0 } },
            { $inc: { [usagePath]: -1 } },
          );
        }
        return response;
      } catch (error) {
        await Subscription.updateOne(
          { _id: sub._id, [usagePath]: { $gt: 0 } },
          { $inc: { [usagePath]: -1 } },
        );
        throw error;
      }
    }

    // ── Numeric Limit Check ──────────────────────────────────────────────
    if (check.type === "limit") {
      // A limit that belongs to the other customer role (e.g. the employer-only
      // applicationsViewed cap on a job seeker's own applications list) is not
      // an entitlement of this subscriber at all: pass through without touching
      // their usage counters.
      if (!isLimitFeatureForRole(check.feature, targetRole)) {
        return handler(req, ctx, params);
      }

      const limitMap: Record<string, { max: number; current: number }> = {
        activeJobs: {
          max: (limits as Record<string, unknown>).maxActiveJobs as number ?? -1,
          current: sub.usage?.activeJobs ?? 0,
        },
        applicationsViewed: {
          max: (limits as Record<string, unknown>).maxApplicationsViewPerMonth as number ?? -1,
          current: sub.usage?.applicationsViewed ?? 0,
        },
        applicationsSubmitted: {
          max: (limits as Record<string, unknown>).maxApplicationsPerMonth as number ?? -1,
          current: sub.usage?.applicationsSubmitted ?? 0,
        },
        teamMembers: {
          max: (limits as Record<string, unknown>).maxTeamMembers as number ?? -1,
          current: 0, // Team count is checked externally
        },
      };

      const entry = limitMap[check.feature];
      if (!entry) {
        return handler(req, ctx, params);
      }

      // Team membership is stateful and counted by its owning workflow.
      if (check.feature === "teamMembers") {
        if (entry.max !== -1 && entry.current >= entry.max) {
          return NextResponse.json(
            {
              error: "LIMIT_EXCEEDED",
              message: `Limit reached for "${check.feature}"`,
              feature: check.feature,
              limit: entry.max,
              used: entry.current,
            },
            { status: 429 },
          );
        }
        return handler(req, ctx, params);
      }

      const usagePath = `usage.${check.feature}`;
      const reserveFilter: Record<string, unknown> = { _id: sub._id };
      if (entry.max !== -1) {
        reserveFilter.$expr = {
          $lt: [{ $ifNull: [`$${usagePath}`, 0] }, entry.max],
        };
      }
      const reserved = await Subscription.findOneAndUpdate(
        reserveFilter,
        { $inc: { [usagePath]: 1 } },
        { new: true },
      );

      if (!reserved) {
        return NextResponse.json(
          {
            error: "LIMIT_EXCEEDED",
            message: `Limit reached for "${check.feature}"`,
            feature: check.feature,
            limit: entry.max,
            used: entry.current,
          },
          { status: 429 },
        );
      }

      try {
        const response = await handler(req, ctx, params);
        if (response.status < 200 || response.status >= 300) {
          await Subscription.updateOne(
            { _id: sub._id, [usagePath]: { $gt: 0 } },
            { $inc: { [usagePath]: -1 } },
          );
        }
        return response;
      } catch (error) {
        await Subscription.updateOne(
          { _id: sub._id, [usagePath]: { $gt: 0 } },
          { $inc: { [usagePath]: -1 } },
        );
        throw error;
      }
    }

    // ── Boolean Toggle Check ─────────────────────────────────────────────
    if (check.type === "toggle") {
      const value = (limits as Record<string, unknown>)[check.feature];
      if (!isToggleEnabled(value)) {
        return NextResponse.json(
          {
            error: "FEATURE_DISABLED",
            message: `Feature "${check.feature}" is not available in your plan`,
            feature: check.feature,
          },
          { status: 403 },
        );
      }

      return handler(req, ctx, params);
    }

    // Fallthrough — unknown check type
    return handler(req, ctx, params);
  };
}
