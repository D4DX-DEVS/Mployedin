import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, Crown, UserCheck, type LucideIcon } from "lucide-react";
import { DashboardSection } from "@/components/shared/DashboardOverview";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatListDate } from "@/lib/ui/intlFormat";

export interface SpotlightSeeker {
  id: string;
  name: string;
  email: string;
  /** Current job title, else the location — whichever the seeker filled in. */
  subtitle?: string;
  premium: boolean;
  referred: boolean;
  createdAt: string;
}

interface AgentTalentSpotlightProps {
  onboarded: number;
  onboardedPremium: number;
  premium: number;
  recentOnboarded: SpotlightSeeker[];
  recentPremium: SpotlightSeeker[];
  locale: string;
}

interface SpotlightPanel {
  key: "onboarded" | "premium";
  count: number;
  detail: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  tile: string;
  rows: SpotlightSeeker[];
  empty: string;
}

/**
 * The talent book under "Needs your attention": onboarded seekers and premium
 * candidates side by side, each with its count, the three latest people and
 * a "See all" into the filtered Job Seekers list. Employer conversion is
 * left to the pipeline's Leads row ("3 won · 17") — no number twice.
 */
export function AgentTalentSpotlight({
  onboarded,
  onboardedPremium,
  premium,
  recentOnboarded,
  recentPremium,
  locale,
}: AgentTalentSpotlightProps) {
  const t = useTranslations("agentDashboard.spotlight");

  const panels: SpotlightPanel[] = [
    {
      key: "onboarded",
      count: onboarded,
      detail: t("onboardedDetail", { count: onboardedPremium }),
      href: `/${locale}/agent/job-seekers?onboarded=1`,
      icon: UserCheck,
      accent: "text-sky-700",
      tile: "bg-sky-100",
      rows: recentOnboarded,
      empty: t("onboardedEmpty"),
    },
    {
      key: "premium",
      count: premium,
      detail: t("premiumDetail", { count: onboardedPremium }),
      href: `/${locale}/agent/job-seekers?premium=1`,
      icon: Crown,
      accent: "text-amber-700",
      tile: "bg-amber-100",
      rows: recentPremium,
      empty: t("premiumEmpty"),
    },
  ];

  return (
    <DashboardSection headingId="agent-talent-spotlight" title={t("title")} description={t("description")}>
      <div className="grid grid-cols-1 gap-3 p-3 sm:p-4 lg:grid-cols-2">
        {panels.map((panel) => {
          const Icon = panel.icon;
          return (
            <div key={panel.key} className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-background">
              <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${panel.tile}`}>
                  <Icon className={`h-5 w-5 ${panel.accent}`} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{panel.count}</span>
                    <span className="truncate text-sm font-semibold text-foreground">{t(panel.key)}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{panel.detail}</p>
                </div>
                <Link
                  href={panel.href}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-9"
                  aria-label={`${t("seeAll")}: ${t(panel.key)}`}
                >
                  {t("seeAll")}
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </div>
              {panel.rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">{panel.empty}</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {panel.rows.map((seeker) => (
                    <li key={seeker.id}>
                      <Link
                        href={`/${locale}/agent/job-seekers?search=${encodeURIComponent(seeker.email)}`}
                        className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <UserAvatar name={seeker.name} email={seeker.email} className="h-8 w-8 shrink-0" colorful />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-foreground">{seeker.name}</span>
                            {seeker.premium && (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label={t("premiumBadge")} />
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {seeker.subtitle ?? seeker.email}
                          </span>
                        </span>
                        <span className="shrink-0 text-end text-xs text-muted-foreground">
                          <span className="block">{formatListDate(seeker.createdAt, locale)}</span>
                          {seeker.referred && <span className="block text-primary">{t("viaReferral")}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </DashboardSection>
  );
}
