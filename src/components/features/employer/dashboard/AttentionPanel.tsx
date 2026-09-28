import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BellRing, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import type { EmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { formatCount } from "@/lib/ui/intlFormat";

export type AttentionLevel = "critical" | "warning" | "upcoming";

export type AttentionId =
  | "no-active-jobs"
  | "unreviewed-48h"
  | "new-applications"
  | "interviews-today"
  | "offers-awaiting"
  | "expiring-jobs"
  | "jobs-without-applications"
  | "draft-jobs"
  | "setup-incomplete";

export interface AttentionItem {
  id: AttentionId;
  level: AttentionLevel;
  count: number;
  /** Path without the locale prefix. */
  path: string;
}

type AttentionInput = Pick<
  EmployerDashboardStats,
  | "activeJobCount"
  | "draftJobCount"
  | "newApplications"
  | "unreviewedOver48h"
  | "interviewsToday"
  | "offersAwaitingResponse"
  | "expiringJobs7d"
  | "jobsWithoutApplications"
  | "setupStepsRemaining"
>;

const LEVEL_ORDER: readonly AttentionLevel[] = ["critical", "warning", "upcoming"];

/**
 * What is waiting on the employer, most urgent first. Every row counts stored
 * records and links to the list filtered to exactly those records. Pure, so
 * the ordering is unit-testable without rendering.
 */
export function buildAttentionItems(s: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const add = (id: AttentionId, level: AttentionLevel, count: number, path: string) => {
    if (count > 0) items.push({ id, level, count, path });
  };

  if (s.activeJobCount === 0 && s.draftJobCount === 0) add("no-active-jobs", "critical", 1, "/employer/jobs/ai-create");
  add("unreviewed-48h", "critical", s.unreviewedOver48h, "/employer/applications?status=applied&sort=oldest");
  add("interviews-today", "warning", s.interviewsToday, "/employer/interviews");
  add("offers-awaiting", "warning", s.offersAwaitingResponse, "/employer/offers");
  add("expiring-jobs", "warning", s.expiringJobs7d, "/employer/jobs?status=active");
  // Fresh applications that are not yet stale are a warning; once any are over
  // 48h the critical row above already covers the queue, so only show the rest.
  add("new-applications", "warning", s.newApplications - s.unreviewedOver48h, "/employer/applications?status=applied");
  add("jobs-without-applications", "upcoming", s.jobsWithoutApplications, "/employer/jobs?status=active");
  add("draft-jobs", "upcoming", s.draftJobCount, "/employer/jobs?status=draft");
  add("setup-incomplete", "upcoming", s.setupStepsRemaining, "/employer/settings");

  return items.sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
}

const LEVEL_BADGE: Record<AttentionLevel, string> = {
  critical: "bg-rose-100 text-rose-800 ring-rose-200",
  warning: "bg-amber-100 text-amber-900 ring-amber-200",
  upcoming: "bg-muted text-muted-foreground ring-border",
};

/** Message key per item; `<key>` is the row title (takes `count`), `<key>Detail` the scope line. */
const ITEM_KEYS: Record<AttentionId, string> = {
  "no-active-jobs": "noActiveJobs",
  "unreviewed-48h": "unreviewed48h",
  "new-applications": "newApplications",
  "interviews-today": "interviewsToday",
  "offers-awaiting": "offersAwaiting",
  "expiring-jobs": "expiringJobs",
  "jobs-without-applications": "jobsWithoutApplications",
  "draft-jobs": "draftJobs",
  "setup-incomplete": "setupIncomplete",
};

interface Props {
  stats: AttentionInput;
  locale: string;
}

/** Compact "needs your attention" list beside the trend chart. */
export function AttentionPanel({ stats, locale }: Props) {
  const t = useTranslations("employerDashboard.overview.attention");
  const items = buildAttentionItems(stats);

  return (
    <Panel
      id="employer-attention"
      icon={BellRing}
      iconClassName={items.length ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}
      title={t("title")}
      subtitle={items.length ? t("itemsNeedAction", { count: items.length }) : t("allClear")}
    >
      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("allClearDetail")}
        </p>
      ) : (
        <ul className="-mx-1 max-h-[27rem] divide-y divide-border/60 overflow-y-auto px-1" data-attention-list>
          {items.map((item) => {
            const stem = ITEM_KEYS[item.id];
            return (
              <li key={item.id}>
                <Link
                  href={`/${locale}${item.path}`}
                  data-attention-id={item.id}
                  data-level={item.level}
                  className="group flex items-center gap-2.5 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-bold tabular-nums ring-1 ring-inset ${LEVEL_BADGE[item.level]}`}>
                    {formatCount(item.count)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold leading-4 text-foreground">{t(`items.${stem}`, { count: item.count })}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      <span className="sr-only">{t(`levels.${item.level}`)} · </span>
                      {t(`items.${stem}Detail`)}
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
