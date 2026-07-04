"use client";

/**
 * <FeatureGate> component — conditionally renders children based on
 * the user's subscription feature gate.
 *
 * Usage:
 *   <FeatureGate feature="scorecardEvaluations">
 *     <ScorecardSection />
 *   </FeatureGate>
 *
 *   <FeatureGate feature="ai_cv_extraction" fallback={<UpgradePrompt feature="CV Extraction" />}>
 *     <CvExtractButton />
 *   </FeatureGate>
 */

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Crown, Lock } from "lucide-react";
import { useFeatureGate } from "@/hooks/useFeatureGate";

interface FeatureGateProps {
  /** The feature key to check (e.g. "scorecardEvaluations", "ai_cv_extraction"). */
  feature: string;
  /** Content rendered when the feature IS available. */
  children: ReactNode;
  /** Optional content rendered when the feature is NOT available. Defaults to UpgradeHint. */
  fallback?: ReactNode;
  /** If true, renders children even when not allowed, but wraps them in a disabled overlay. */
  disableOnly?: boolean;
  /** Label to show in the default fallback. */
  label?: string;
}

export function FeatureGate({
  feature,
  children,
  fallback,
  disableOnly = false,
  label,
}: FeatureGateProps) {
  const { allowed, isLoading, remaining } = useFeatureGate(feature);

  // While loading, show nothing to avoid layout shift
  if (isLoading) return null;

  if (allowed) {
    return <>{children}</>;
  }

  // Disabled overlay mode — show the content but prevent interaction
  if (disableOnly) {
    return (
      <div className="relative">
        <div className="pointer-events-none opacity-40 select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <UpgradeHint label={label ?? feature} />
        </div>
      </div>
    );
  }

  // Custom fallback
  if (fallback) return <>{fallback}</>;

  // Default fallback
  return <UpgradeHint label={label ?? feature} />;
}

/** Compact upgrade prompt shown when a feature is gated. */
function UpgradeHint({ label }: { label: string }) {
  const t = useTranslations("featureGate");
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
        <Crown className="h-4 w-4 text-amber-500" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-amber-200/90">{t("upgradeRequired")}</p>
        <p className="text-xs text-muted-foreground truncate">
          {t("featureRequiresHigherPlan")}
        </p>
      </div>
    </div>
  );
}

/** Inline lock icon badge for compact spaces (e.g. next to a button). */
export function FeatureLockBadge({ feature }: { feature: string }) {
  const t = useTranslations("featureGate");
  const { allowed, isLoading } = useFeatureGate(feature);

  if (isLoading || allowed) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
      <Lock className="h-3 w-3" />
      {t("premium")}
    </span>
  );
}
