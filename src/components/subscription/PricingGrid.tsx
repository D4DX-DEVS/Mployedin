"use client";

/**
 * PricingGrid
 *
 * Renders all available subscription plans side-by-side with currency conversion.
 * Works for both employer and job seeker roles.
 *
 * - Converts prices to the user's selected display currency
 * - Highlights the currently active tier
 * - "Activate Free Plan" self-assigns the default plan
 * - "Upgrade" on paid plans shows a "contact admin" toast (no payment gateway yet)
 * - Feature comparison table collapsed by default behind accordion
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, Sparkles, Crown, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AvailablePlan } from "@/hooks/useSubscription";
import { useSelfAssignFreePlan } from "@/hooks/useSubscription";
import { convertAndFormat } from "@/lib/currency";

// ── Helpers ──────────────────────────────────────────────────────────────────

function numLabel(n: number) {
  return n === -1 ? "Unlimited" : String(n);
}

// ── Feature descriptors ──────────────────────────────────────────────────────

interface FeatureRow {
  label: string;
  key: string;
  format?: (v: unknown) => string;
}

const EMPLOYER_FEATURES: FeatureRow[] = [
  { label: "Job Postings", key: "maxActiveJobs", format: (v) => numLabel(v as number) },
  { label: "Applications / month", key: "maxApplicationsViewPerMonth", format: (v) => numLabel(v as number) },
  { label: "Team Members", key: "maxTeamMembers", format: (v) => numLabel(v as number) },
  { label: "Analytics", key: "analyticsLevel", format: (v) => String(v ?? "none") },
  { label: "Data Export", key: "dataExport" },
  { label: "Message Templates", key: "commTemplates" },
  { label: "Scorecards", key: "scorecardEvaluations" },
  { label: "Branded Company Page", key: "brandedCompanyPage" },
  { label: "Priority Support", key: "prioritySupport" },
];

const JOB_SEEKER_FEATURES: FeatureRow[] = [
  { label: "Applications / month", key: "maxApplicationsPerMonth", format: (v) => numLabel(v as number) },
  { label: "Profile Visibility Boost", key: "profileVisibilityBoost" },
  { label: "Salary Insights", key: "salaryInsights" },
  { label: "Priority Application Review", key: "priorityApplicationReview" },
  { label: "Resume Builder", key: "resumeBuilderAccess" },
];

// ── Plan highlight features (for the card bullet list) ───────────────────────

function getPlanHighlights(plan: AvailablePlan, isEmployer: boolean): { label: string; included: boolean }[] {
  if (isEmployer) {
    const l = plan.employerLimits;
    if (!l) return [];
    return [
      { label: `${numLabel(l.maxActiveJobs)} Job Postings`, included: true },
      { label: `${numLabel(l.maxApplicationsViewPerMonth)} Applications/mo`, included: true },
      { label: `${numLabel(l.maxTeamMembers)} Team Members`, included: true },
      { label: "CV Database Access", included: l.dataExport },
      { label: `${l.analyticsLevel === "none" ? "Basic" : l.analyticsLevel === "basic" ? "Basic" : "Advanced"} Analytics`, included: l.analyticsLevel !== "none" },
      { label: "Priority Support", included: l.prioritySupport },
    ];
  }
  const l = plan.jobSeekerLimits;
  if (!l) return [];
  return [
    { label: `${numLabel(l.maxApplicationsPerMonth)} Applications/mo`, included: true },
    { label: "Profile Boost", included: l.profileVisibilityBoost },
    { label: "Salary Insights", included: l.salaryInsights },
    { label: "Priority Review", included: l.priorityApplicationReview },
    { label: "Resume Builder", included: l.resumeBuilderAccess },
  ];
}

// ── Tier icon ────────────────────────────────────────────────────────────────

function TierIcon({ tier }: { tier: number }) {
  if (tier === 0) return <Zap className="h-5 w-5 text-muted-foreground" />;
  if (tier === 1) return <Sparkles className="h-5 w-5 text-sky-500" />;
  return <Crown className="h-5 w-5 text-amber-500" />;
}

// ── Cell renderer for comparison table ───────────────────────────────────────

function Cell({ value, format }: { value: unknown; format?: (v: unknown) => string }) {
  if (format) return <span className="text-sm font-medium">{format(value)}</span>;
  return value ? (
    <Check className="h-4 w-4 text-emerald-500 mx-auto" />
  ) : (
    <X className="h-4 w-4 text-muted-foreground/25 mx-auto" />
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface PricingGridProps {
  plans: AvailablePlan[];
  currentTier?: number;
  showActivateFree?: boolean;
  displayCurrency?: string;
  rates?: Record<string, number>;
}

export function PricingGrid({
  plans,
  currentTier,
  showActivateFree = false,
  displayCurrency = "AED",
  rates = {},
}: PricingGridProps) {
  const t = useTranslations("pricingGrid");
  const { mutate: selfAssign, isPending: activating } = useSelfAssignFreePlan();
  const [showComparison, setShowComparison] = useState(false);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);

  async function startCheckout(planId: string) {
    setCheckoutPlanId(planId);
    try {
      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast.info(t("upgradeComingSoon"), {
        description:
          data.message ??
          t("paymentNotAvailable"),
      });
    } catch {
      toast.error(t("checkoutError"));
    } finally {
      setCheckoutPlanId(null);
    }
  }

  const isEmployer = plans.some((p) => p.targetRole === "employer");
  const rows = isEmployer ? EMPLOYER_FEATURES : JOB_SEEKER_FEATURES;

  if (!plans.length) return null;

  return (
    <div className="space-y-5">
      {/* ── Plan cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isActive = currentTier === plan.tier;
          const isFreePlan = plan.price === 0;
          const isMostPopular = plan.tier === 1 && plans.length > 2;
          const highlights = getPlanHighlights(plan, isEmployer);

          return (
            <div
              key={plan._id}
              className={`relative rounded-2xl border p-5 flex flex-col transition-shadow hover:shadow-md ${
                isActive
                  ? "border-sky-500 bg-gradient-to-b from-sky-500/5 to-transparent ring-1 ring-sky-500/20"
                  : isMostPopular
                    ? "border-amber-400 bg-gradient-to-b from-amber-500/5 to-transparent"
                    : "border-border/60 bg-card"
              }`}
            >
              {isMostPopular && !isActive && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-amber-500 text-white text-[10px] px-2.5 py-0.5 shadow-sm font-semibold">
                    {t("popular")}
                  </Badge>
                </div>
              )}
              {isActive && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-sky-500 text-white text-[10px] px-2.5 py-0.5 shadow-sm font-semibold">
                    {t("currentPlan")}
                  </Badge>
                </div>
              )}

              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <TierIcon tier={plan.tier} />
                <p className="font-semibold">{plan.name}</p>
              </div>

              {/* Price */}
              <div className="mb-4">
                <p className="text-3xl font-bold tracking-tight">
                  {isFreePlan
                    ? t("free")
                    : convertAndFormat(plan.price, plan.currency, displayCurrency, rates)}
                </p>
                {plan.price > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    / {plan.billingCycle}
                    {displayCurrency !== plan.currency && (
                      <span className="text-muted-foreground/50 ml-1">
                        ({plan.price} {plan.currency})
                      </span>
                    )}
                  </p>
                )}
                {isFreePlan && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t("foreverFree")}</p>
                )}
              </div>

              {/* Feature bullets */}
              <ul className="space-y-2 mb-5 flex-1">
                {highlights.map((h) => (
                  <li key={h.label} className="flex items-start gap-2 text-sm">
                    {h.included ? (
                      <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                    )}
                    <span className={h.included ? "" : "text-muted-foreground/50"}>
                      {h.label}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              {isActive ? (
                <Button variant="outline" disabled className="w-full mt-auto">
                  <Check className="h-4 w-4 mr-1.5 text-emerald-500" /> {t("currentPlan")}
                </Button>
              ) : isFreePlan && (showActivateFree || currentTier === undefined) ? (
                <Button className="w-full mt-auto" onClick={() => selfAssign()} disabled={activating}>
                  {activating ? t("activating") : t("activateFreePlan")}
                </Button>
              ) : (
                <Button
                  variant={isMostPopular ? "default" : "outline"}
                  className={`w-full mt-auto ${isMostPopular ? "bg-sky-600 hover:bg-sky-700" : ""}`}
                  onClick={() => startCheckout(plan._id)}
                  disabled={checkoutPlanId !== null}
                >
                  {checkoutPlanId === plan._id ? t("redirecting") : t("choosePlan", { name: plan.name })}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Feature comparison accordion ── */}
      <button
        onClick={() => setShowComparison(!showComparison)}
        className="flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {showComparison ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showComparison ? t("hide") : t("viewAll")} {t("featuresComparison")}
      </button>

      {showComparison && (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden animate-in slide-in-from-top-2 duration-200">
          <div
            className="grid border-b border-border/40"
            style={{ gridTemplateColumns: `1.5fr repeat(${plans.length}, minmax(0, 1fr))` }}
          >
            <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("feature")}
            </div>
            {plans.map((plan) => (
              <div
                key={plan._id}
                className={`p-3 text-center text-xs font-semibold ${
                  currentTier === plan.tier ? "text-sky-500 bg-sky-500/5" : "text-muted-foreground"
                }`}
              >
                {plan.name}
              </div>
            ))}
          </div>

          {rows.map((row, idx) => (
            <div
              key={row.key}
              className={`grid border-b border-border/20 last:border-0 ${idx % 2 === 1 ? "bg-muted/10" : ""}`}
              style={{ gridTemplateColumns: `1.5fr repeat(${plans.length}, minmax(0, 1fr))` }}
            >
              <div className="p-3 text-sm">{row.label}</div>
              {plans.map((plan) => {
                const limits = isEmployer ? plan.employerLimits : plan.jobSeekerLimits;
                const value = limits ? (limits as Record<string, unknown>)[row.key] : undefined;
                return (
                  <div
                    key={plan._id}
                    className={`p-3 text-center ${currentTier === plan.tier ? "bg-sky-500/5" : ""}`}
                  >
                    <Cell value={value} format={row.format} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
