"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, ChevronRight, TrendingUp, AlertCircle, Star, Loader2, BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AIRecommendedCandidatesCardProps {
  /** Total candidates with aiMatchScore >= 80 (high matches). */
  highMatchCount: number;
  /** Candidates with aiMatchScore >= 90. */
  band90PlusCount: number;
  /** Candidates with 80 <= aiMatchScore < 90. */
  band80to89Count: number;
  /** Candidates with 1 <= aiMatchScore < 80 (worth a look). */
  needsReviewCount: number;
  /** Active job count, used for the headline copy. */
  activeJobCount: number;
  /** Active locale for href construction. */
  locale: string;
}

interface Band {
  /** Translation key for the band label. */
  labelKey: string;
  /** Translation key for the band description. */
  descKey: string;
  /** Lower score bound (inclusive) for the applications deep-link. */
  scoreMin: number;
  /** Upper score bound (exclusive) for the applications deep-link. */
  scoreMax: number;
  /** Count to display. */
  count: number;
  icon: React.ElementType;
  accent: string;
  /** Whether to highlight this band as the best tier. */
  emphasize?: boolean;
}

/**
 * AI Recommended Candidates section for the employer dashboard.
 *
 * Surfaces high-match candidates discovered by the platform's AI matching,
 * broken down into actionable bands (90%+, 80–89%, needs review). Each band
 * deep-links into the Applications page filtered by match score and sorted by
 * AI score descending.
 *
 * Data is sourced from `getEmployerDashboardStats` (cached 10s, single
 * aggregation reusing the indexed `aiMatchScore` field) — no extra queries.
 */
export function AIRecommendedCandidatesCard({
  highMatchCount,
  band90PlusCount,
  band80to89Count,
  needsReviewCount,
  activeJobCount,
  locale,
}: AIRecommendedCandidatesCardProps) {
  const t = useTranslations("employerDashboard.aiRecommended");
  const [notifyingKey, setNotifyingKey] = useState<string | null>(null);
  const [notifiedKeys, setNotifiedKeys] = useState<Set<string>>(new Set());

  // Deep-link base: Applications page filtered by AI match score.
  // (scoreMin/scoreMax are supported by the useApplications hook + applications API.)
  const applicationsBase = `/${locale}/employer/applications`;

  async function handleNotify(labelKey: string, scoreMin: number, scoreMax: number) {
    if (notifyingKey) return;
    setNotifyingKey(labelKey);
    try {
      const res = await fetch("/api/employer/applications/notify-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreMin, scoreMax }),
      });
      if (!res.ok) {
        toast.error(t("notifyError"));
        return;
      }
      const data = (await res.json()) as { notified: number };
      setNotifiedKeys((prev) => new Set(prev).add(labelKey));
      toast.success(data.notified > 0 ? t("notifySuccess", { count: data.notified }) : t("notifyNone"));
    } catch {
      toast.error(t("notifyError"));
    } finally {
      setNotifyingKey(null);
    }
  }

  const bands: Band[] = [
    {
      labelKey: "band90Plus",
      descKey: "band90PlusDesc",
      scoreMin: 90,
      scoreMax: 101,
      count: band90PlusCount,
      icon: Star,
      accent:
        "border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
      emphasize: true,
    },
    {
      labelKey: "band80to89",
      descKey: "band80to89Desc",
      scoreMin: 80,
      scoreMax: 90,
      count: band80to89Count,
      icon: TrendingUp,
      accent:
        "border-sky-200 bg-sky-50/70 text-sky-700 hover:border-sky-300 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    },
    {
      labelKey: "needsReview",
      descKey: "needsReviewDesc",
      scoreMin: 1,
      scoreMax: 80,
      count: needsReviewCount,
      icon: AlertCircle,
      accent:
        "border-amber-200 bg-amber-50/70 text-amber-700 hover:border-amber-300 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    },
  ];

  // Hide the entire section if there are no scored candidates at all.
  const hasAnyMatches = highMatchCount > 0 || needsReviewCount > 0;
  if (!hasAnyMatches) return null;

  return (
    <section
      aria-label={t("sectionLabel")}
      className="workspace-panel-surface overflow-hidden rounded-2xl sm:rounded-[28px]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-3 py-2.5 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 sm:px-2.5 sm:py-1 sm:text-[11px] sm:tracking-[0.18em]">
              <Sparkles className="h-3.5 w-3.5" />
              {t("eyebrow")}
            </span>
          </div>
          <h2 className="mt-1.5 text-base font-semibold tracking-tight text-foreground sm:mt-2.5 sm:text-2xl">
            {t("heading")}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:mt-1.5 sm:text-sm sm:leading-6">
            {t("subheading", { count: highMatchCount, jobs: activeJobCount })}
          </p>
        </div>
      </div>

      {/* Band breakdown */}
      {/* One band per row — three bands in a 2-up grid always orphaned the third.
          Each row is a single compact line instead, which is shorter overall. */}
      <div className="space-y-1.5 px-2.5 py-2.5 sm:space-y-2.5 sm:px-5 sm:py-5">
        {bands.map((band) => {
          const Icon = band.icon;
          const bandHref = `${applicationsBase}?scoreMin=${band.scoreMin}&scoreMax=${band.scoreMax}`;
          const isNotifying = notifyingKey === band.labelKey;
          const isNotified = notifiedKeys.has(band.labelKey);
          return (
            <div
              key={band.labelKey}
              className={cn(
                "group flex items-center gap-1 rounded-xl border transition-all hover:-translate-y-0.5 sm:gap-2 sm:rounded-[20px]",
                band.accent
              )}
            >
              <Link
                href={bandHref}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:gap-3 sm:px-4 sm:py-3.5"
              >
                <div className="shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold sm:text-sm">{t(band.labelKey)}</p>
                  {/* Description is desktop-only — it wrapped to three lines on phones. */}
                  <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{t(band.descKey)}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full bg-background/80 px-2 py-0.5 text-xs font-bold tabular-nums sm:px-2.5 sm:text-sm",
                    band.emphasize && "text-emerald-600 dark:text-emerald-300"
                  )}
                >
                  {band.count}
                </span>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
              </Link>
              <button
                type="button"
                onClick={() => handleNotify(band.labelKey, band.scoreMin, band.scoreMax)}
                disabled={isNotifying || isNotified || band.count === 0}
                title={t("notifyHint")}
                className="me-1.5 flex shrink-0 items-center gap-1 rounded-full border border-current/25 bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 sm:me-3 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs"
              >
                {isNotifying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isNotified ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <BellRing className="h-3 w-3" />
                )}
                {isNotifying ? t("notifying") : isNotified ? t("notified") : t("notify")}
              </button>
            </div>
          );
        })}
      </div>

      {/* Primary CTA */}
      <div className="border-t border-border/60 px-2.5 py-2.5 sm:px-5 sm:py-3.5">
        <Link
          href={`${applicationsBase}?scoreMin=80`}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 sm:w-auto"
        >
          {t("reviewCandidates")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
