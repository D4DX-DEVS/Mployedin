"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Ban, Briefcase, Check, CheckCircle2, Copy, CreditCard, FileText, Pencil, Sparkles, Trash2, Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { RowExpandToggle, isRowToggleClick } from "@/components/shared/RowExpandToggle";
import type { SubscriptionPlanItem } from "@/hooks/useSubscriptionPlans";
import { convertAndFormat } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { AI_FEATURE_LABEL_KEYS, BILLING_CYCLE_LABEL_KEYS, TIER_COLORS } from "./planLabels";

// The Actions column is a fixed width, not `auto`: the header row and every
// plan row are separate grids, and an `auto` column sized to "Actions" in one
// and to the buttons in the other pulled the columns out of line.
const ROW_GRID = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_6rem]";
// Price and Includes sit under the plan name on phones, past the chevron.
const UNDER_NAME = "col-span-2 ps-9 sm:ps-10 md:col-span-1 md:ps-0";
const DETAIL_HEADING = "mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground";

interface PlansListProps {
  plans: readonly SubscriptionPlanItem[];
  systemCurrency: string;
  /** The plan a deactivate / reactivate / delete request is running for. */
  pendingId: string | null;
  onEdit: (plan: SubscriptionPlanItem) => void;
  onDuplicate: (plan: SubscriptionPlanItem) => void;
  onDeactivate: (plan: SubscriptionPlanItem) => void;
  onReactivate: (plan: SubscriptionPlanItem) => void;
  onDestroy: (plan: SubscriptionPlanItem) => void;
}

interface IncludedItem {
  key: string;
  icon: LucideIcon;
  label: string;
}

/**
 * The plans of one audience as a list panel: the row says what the plan costs
 * and what it includes, the pen edits it, "…" holds the rest, and the row (or
 * its chevron) opens the full limits in place.
 */
export function PlansList({
  plans, systemCurrency, pendingId, onEdit, onDuplicate, onDeactivate, onReactivate, onDestroy,
}: PlansListProps) {
  const t = useTranslations("adminSubscriptionPlans");
  const tc = useTranslations("common");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** Mirrors the API's hard-delete guard so the menu can say no first. */
  const canDestroy = (p: SubscriptionPlanItem) => !p.isDefault && (p.subscriptionCount ?? 0) === 0;
  // A plan with any subscription history cannot be destroyed — billing records
  // render its name. The item says why rather than letting the admin confirm a
  // permanent delete that then 409s.
  const destroyLabel = (p: SubscriptionPlanItem) =>
    p.isDefault
      ? t("deleteBlockedDefault")
      : (p.subscriptionCount ?? 0) > 0
        ? t("deleteBlockedInUse", { count: p.subscriptionCount ?? 0 })
        : t("deletePlanTooltip");

  // An active plan can only be deactivated; an inactive one can be brought
  // back or destroyed.
  const menuFor = (p: SubscriptionPlanItem): RowAction[] => {
    const pending = pendingId === p._id;
    const duplicate: RowAction = { key: "duplicate", label: t("duplicateTooltip"), icon: Copy, onSelect: () => onDuplicate(p) };
    if (p.isActive) {
      return [
        duplicate,
        { key: "deactivate", label: t("deactivateTooltip"), icon: Ban, destructive: true, pending, onSelect: () => onDeactivate(p) },
      ];
    }
    return [
      duplicate,
      { key: "reactivate", label: t("reactivateTooltip"), icon: CheckCircle2, iconClassName: "text-emerald-600", pending, onSelect: () => onReactivate(p) },
      { key: "delete", label: destroyLabel(p), icon: Trash2, destructive: true, disabled: !canDestroy(p), pending, onSelect: () => onDestroy(p) },
    ];
  };

  const countOrUnlimited = (value: number, unlimitedKey: string, countKey: string, param: string) =>
    value === -1 ? t(unlimitedKey) : t(countKey, { [param]: value });

  const includedFor = (p: SubscriptionPlanItem): IncludedItem[] => {
    const limits = p.employerLimits ?? p.jobSeekerLimits;
    const ai: IncludedItem = {
      key: "ai",
      icon: Sparkles,
      label: t("aiFeatureCount", { count: limits?.aiFeatures?.filter((a) => a.enabled).length ?? 0 }),
    };
    if (p.targetRole === "employer" && p.employerLimits) {
      return [
        { key: "jobs", icon: Briefcase, label: countOrUnlimited(p.employerLimits.maxActiveJobs, "unlimitedJobsDisplay", "jobsLimitDisplay", "jobs") },
        { key: "seats", icon: Users, label: countOrUnlimited(p.employerLimits.maxTeamMembers, "unlimitedSeatsDisplay", "seatsLimitDisplay", "seats") },
        ai,
      ];
    }
    if (p.targetRole === "job_seeker" && p.jobSeekerLimits) {
      return [
        { key: "applications", icon: FileText, label: countOrUnlimited(p.jobSeekerLimits.maxApplicationsPerMonth, "unlimitedApplicationsDisplay", "applicationsLimitDisplay", "count") },
        ai,
      ];
    }
    return [ai];
  };

  return (
    <section className="workspace-panel-surface overflow-hidden rounded-2xl">
      <div className={cn("hidden items-center gap-4 border-b border-border/70 bg-background/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:grid", ROW_GRID)}>
        <span className="ps-10">{t("columnPlan")}</span>
        <span>{t("columnPrice")}</span>
        <span>{t("columnIncludes")}</span>
        <span className="text-end">{tc("actions")}</span>
      </div>

      <div className="divide-y divide-border/60">
        {plans.map((p) => {
          const isExpanded = expandedId === p._id;
          const toggle = () => setExpandedId(isExpanded ? null : p._id);
          // Formatted even when no conversion is needed: a plain "599 INR" sat
          // beside "₹ 11,367.22" in the same column.
          const price = convertAndFormat(p.price, p.currency, systemCurrency);

          return (
            <article
              key={p._id}
              aria-busy={pendingId === p._id || undefined}
              onClick={(e) => {
                // Reading or copying from the open details must not fold them away.
                if (e.target instanceof Element && e.target.closest("[data-plan-details]")) return;
                if (isRowToggleClick(e)) toggle();
              }}
              className={cn(
                "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-background/70 sm:px-5 sm:py-4 md:gap-4",
                ROW_GRID,
                !p.isActive && "bg-muted/30",
                pendingId === p._id && "opacity-60",
              )}
            >
              {/* Plan */}
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <RowExpandToggle expanded={isExpanded} onToggle={toggle} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h3 className={cn("truncate text-sm font-semibold tracking-tight sm:text-base", p.isActive ? "text-foreground" : "text-muted-foreground")}>
                      {p.name}
                    </h3>
                    <Badge className={cn("text-[11px]", TIER_COLORS[p.tier] ?? TIER_COLORS[0])}>{t("tierBadge", { tier: p.tier })}</Badge>
                    {p.isDefault && <Badge className="bg-emerald-100 text-[11px] text-emerald-700">{t("defaultBadge")}</Badge>}
                    {!p.isActive && <Badge variant="outline" className="text-[11px] text-muted-foreground">{t("inactiveBadge")}</Badge>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t("subscriptionCount", { count: p.subscriptionCount ?? 0 })}
                  </p>
                </div>
              </div>

              {/* Price */}
              <p className={cn("flex items-baseline gap-1.5 md:block", UNDER_NAME)}>
                <span className="text-sm font-semibold text-foreground">{price}</span>
                <span className="text-xs text-muted-foreground md:hidden" aria-hidden="true">/</span>
                <span className="text-xs text-muted-foreground md:mt-0.5 md:block">{t(BILLING_CYCLE_LABEL_KEYS[p.billingCycle])}</span>
              </p>

              {/* Includes */}
              <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:text-sm", UNDER_NAME)}>
                {includedFor(p).map(({ key, icon: Icon, label }) => (
                  <li key={key} className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>

              {/* On phones the actions share the name's line. */}
              <RowActions
                name={p.name}
                className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto"
                quick={[{ key: "edit", label: t("editTooltip"), icon: Pencil, iconOnly: true, onSelect: () => onEdit(p) }]}
                menu={menuFor(p)}
              />

              {isExpanded && <PlanDetails plan={p} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Everything the plan grants, opened in place under its row. */
function PlanDetails({ plan: p }: { plan: SubscriptionPlanItem }) {
  const t = useTranslations("adminSubscriptionPlans");
  const limits = p.employerLimits ?? p.jobSeekerLimits;
  const enabledAI = limits?.aiFeatures?.filter((a) => a.enabled) ?? [];
  const numberOrUnlimited = (value: number) => (value === -1 ? t("unlimitedValue") : value);

  const limitRows: [string, string | number][] =
    p.targetRole === "employer" && p.employerLimits
      ? [
          [t("maxActiveJobsDetail"), numberOrUnlimited(p.employerLimits.maxActiveJobs)],
          [t("appViewsPerMonthDetail"), numberOrUnlimited(p.employerLimits.maxApplicationsViewPerMonth)],
          [t("teamSeatsDetail"), numberOrUnlimited(p.employerLimits.maxTeamMembers)],
          [t("featuredJobsDetail"), numberOrUnlimited(p.employerLimits.featuredJobListings)],
        ]
      : p.jobSeekerLimits
        ? [[t("maxApplicationsJobSeekerLabel"), numberOrUnlimited(p.jobSeekerLimits.maxApplicationsPerMonth)]]
        : [];

  const features: { key: string; label: string; on: boolean; detail?: string }[] =
    p.targetRole === "employer" && p.employerLimits
      ? [
          {
            key: "analytics",
            label: t("analyticsFeatureLabel"),
            on: p.employerLimits.analyticsLevel !== "none",
            detail: p.employerLimits.analyticsLevel === "advanced" ? t("analyticsLevelAdvanced") : t("analyticsLevelBasic"),
          },
          { key: "dataExport", label: t("dataExportFeatureLabel"), on: p.employerLimits.dataExport },
          { key: "commTemplates", label: t("commTemplatesFeatureLabel"), on: p.employerLimits.commTemplates },
          { key: "scorecards", label: t("scorecardsFeatureLabel"), on: p.employerLimits.scorecardEvaluations },
          { key: "matchingWeights", label: t("matchingWeightsFeatureLabel"), on: p.employerLimits.matchingWeightCustomization },
          { key: "workflow", label: t("workflowFeatureLabel"), on: p.employerLimits.workflowCustomization },
          { key: "prioritySupport", label: t("prioritySupportFeatureLabel"), on: p.employerLimits.prioritySupport },
          { key: "brandedPage", label: t("brandedPageFeatureLabel"), on: p.employerLimits.brandedCompanyPage },
        ]
      : p.jobSeekerLimits
        ? [
            { key: "visibilityBoost", label: t("visibilityBoostFeatureLabel"), on: p.jobSeekerLimits.profileVisibilityBoost },
            { key: "salaryInsights", label: t("salaryInsightsFeatureLabel"), on: p.jobSeekerLimits.salaryInsights },
            { key: "priorityReview", label: t("priorityReviewFeatureLabel"), on: p.jobSeekerLimits.priorityApplicationReview },
            { key: "resumeBuilder", label: t("resumeBuilderFeatureLabel"), on: p.jobSeekerLimits.resumeBuilderAccess },
          ]
        : [];

  const included = features.filter((f) => f.on);

  return (
    <div data-plan-details="" className="col-span-full cursor-default rounded-xl border border-border/70 bg-card/60 p-3 text-xs sm:p-4">
      {p.description && <p className="mb-3 text-sm text-muted-foreground">{p.description}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <h4 className={DETAIL_HEADING}>{t("featureLimitsTab")}</h4>
          <dl className="max-w-xs space-y-1.5">
            {limitRows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Only what the plan grants (owner, 2026-09-28): the crossed-out
            "not included" chips outnumbered the real ones on lower tiers. */}
        <div>
          <h4 className={DETAIL_HEADING}>{t("featuresHeading")}</h4>
          {included.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {included.map((f) => (
                <li key={f.key} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {f.label}
                  {f.detail && <span className="opacity-60">({f.detail})</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("noFeaturesIncluded")}</p>
          )}
        </div>

        <div>
          <h4 className={cn(DETAIL_HEADING, "flex items-center gap-1.5")}>
            <Sparkles className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" /> {t("aiFeatureHeading")}
          </h4>
          {enabledAI.length > 0 ? (
            <ul className="max-w-xs space-y-1.5">
              {enabledAI.map((a) => (
                <li key={a.feature} className="flex items-baseline justify-between gap-3">
                  <span className="text-foreground">{t(AI_FEATURE_LABEL_KEYS[a.feature] ?? a.feature)}</span>
                  <span className="shrink-0 font-medium text-muted-foreground">
                    {a.monthlyLimit === 0 ? t("unlimitedValue") : t("monthlyLimitFormat", { limit: a.monthlyLimit })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("aiFeatureCount", { count: 0 })}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shaped like the list: column heads, then rows of name, price, includes, actions. */
export function PlansListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <section className="workspace-panel-surface overflow-hidden rounded-2xl" aria-hidden="true">
      <div className={cn("hidden gap-4 border-b border-border/70 bg-background/50 px-5 py-3 md:grid", ROW_GRID)}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-3 w-16" />)}
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-4 sm:px-5 md:gap-4", ROW_GRID)}>
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className={UNDER_NAME}><Skeleton className="h-4 w-24" /></div>
            <div className={UNDER_NAME}><Skeleton className="h-4 w-48 max-w-full" /></div>
            <div className="col-start-2 row-start-1 flex justify-end gap-2 md:col-start-auto md:row-start-auto">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-9 w-9 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
