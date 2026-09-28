import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, ChevronRight, TrendingUp, AlertCircle, Star } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import { formatCount } from "@/lib/ui/intlFormat";

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
 * AI Recommended Candidates panel for the employer dashboard.
 *
 * Surfaces high-match candidates discovered by the platform's AI matching,
 * broken down into actionable bands (90%+, 80–89%, needs review). Each band
 * deep-links into the Applications page filtered by match score.
 *
 * The "estimates don't replace human review" note sits in the panel footer
 * so the reminder travels with the numbers.
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
    { labelKey: "band90Plus", descKey: "band90PlusDesc", scoreMin: 90, scoreMax: 101, count: band90PlusCount, icon: Star, accent: "bg-emerald-50 text-emerald-700" },
    { labelKey: "band80to89", descKey: "band80to89Desc", scoreMin: 80, scoreMax: 90, count: band80to89Count, icon: TrendingUp, accent: "bg-primary/10 text-primary" },
    { labelKey: "needsReview", descKey: "needsReviewDesc", scoreMin: 1, scoreMax: 80, count: needsReviewCount, icon: AlertCircle, accent: "bg-amber-50 text-amber-800" },
  ];

  const hasAnyMatches = highMatchCount > 0 || needsReviewCount > 0;

  return (
    <Panel
      id="employer-profile-match-estimates"
      icon={Sparkles}
      iconClassName="bg-violet-100 text-violet-800"
      title={t("heading")}
      subtitle={hasAnyMatches ? t("subheading", { count: highMatchCount, jobs: activeJobCount }) : t("emptyDescription")}
      action={hasAnyMatches ? { href: `${applicationsBase}?scoreMin=80`, label: t("reviewCandidates") } : undefined}
      bodyClassName="justify-between gap-3"
    >
      {hasAnyMatches ? (
        <ul className="divide-y divide-border/60">
          {bands.map((band) => {
            const Icon = band.icon;
            const bandHref = `${applicationsBase}?scoreMin=${band.scoreMin}&scoreMax=${band.scoreMax}`;
            return (
              <li key={band.labelKey}>
                <Link
                  href={bandHref}
                  className="group flex min-h-11 items-center gap-2.5 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${band.accent}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold leading-4 text-foreground">{t(band.labelKey)}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{t(band.descKey)}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{formatCount(band.count)}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-1 items-center gap-3 rounded-lg bg-muted/40 px-3 py-4">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("emptyDescription")}</p>
          </div>
        </div>
      )}
      <p className="border-t border-border/60 pt-2.5 text-[11px] leading-4 text-muted-foreground">{t("assistiveNote")}</p>
    </Panel>
  );
}
