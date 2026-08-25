import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, ChevronRight, TrendingUp, AlertCircle, Star } from "lucide-react";
import { DashboardSection } from "@/components/shared/DashboardOverview";

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

  // Deep-link base: Applications page filtered by AI match score.
  // (scoreMin/scoreMax are supported by the useApplications hook + applications API.)
  const applicationsBase = `/${locale}/employer/applications`;

  const bands: Band[] = [
    {
      labelKey: "band90Plus",
      descKey: "band90PlusDesc",
      scoreMin: 90,
      scoreMax: 101,
      count: band90PlusCount,
      icon: Star,
      accent: "text-emerald-600",
    },
    {
      labelKey: "band80to89",
      descKey: "band80to89Desc",
      scoreMin: 80,
      scoreMax: 90,
      count: band80to89Count,
      icon: TrendingUp,
      accent: "text-sky-600",
    },
    {
      labelKey: "needsReview",
      descKey: "needsReviewDesc",
      scoreMin: 1,
      scoreMax: 80,
      count: needsReviewCount,
      icon: AlertCircle,
      accent: "text-amber-600",
    },
  ];

  const hasAnyMatches = highMatchCount > 0 || needsReviewCount > 0;

  return (
    <DashboardSection
      headingId="employer-profile-match-estimates"
      title={t("heading")}
      description={
        hasAnyMatches
          ? t("subheading", { count: highMatchCount, jobs: activeJobCount })
          : t("emptyDescription")
      }
      className="flex h-full flex-col"
      bodyClassName="flex flex-1 flex-col"
      action={
        hasAnyMatches ? (
          <Link
            href={`${applicationsBase}?scoreMin=80`}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:text-sm"
          >
            {t("reviewCandidates")}
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      {hasAnyMatches ? (
        <div className="divide-y divide-border/60">
          {bands.map((band) => {
            const Icon = band.icon;
            const bandHref = `${applicationsBase}?scoreMin=${band.scoreMin}&scoreMax=${band.scoreMax}`;
            return (
              <Link
                key={band.labelKey}
                href={bandHref}
                className="group flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-5"
              >
                <Icon className={`h-4 w-4 shrink-0 ${band.accent}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{t(band.labelKey)}</span>
                  <span className="mt-0.5 hidden text-xs leading-4 text-muted-foreground sm:block">{t(band.descKey)}</span>
                </span>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-sm font-semibold tabular-nums text-foreground">
                  {band.count}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-3 px-4 py-4 sm:px-5">
          <Sparkles className="h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("emptyDescription")}</p>
          </div>
        </div>
      )}
      <div className="mt-auto flex items-start gap-2 border-t border-border/60 px-4 py-3 text-xs leading-5 text-muted-foreground sm:px-5">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden="true" />
        <p>{t("assistiveNote")}</p>
      </div>
    </DashboardSection>
  );
}
