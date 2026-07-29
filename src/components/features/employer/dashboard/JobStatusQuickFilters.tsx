"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Briefcase, FileEdit, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobStatusQuickFiltersProps {
  /** Active job count shown on the Active tab badge. */
  activeJobs: number;
  /** Draft job count shown on the Draft tab badge. */
  draftJobs: number;
  /** Paused job count shown on the Paused tab badge. */
  pausedJobs: number;
  /** Active locale for href construction. */
  locale: string;
}

interface Tab {
  status: "active" | "draft" | "paused";
  href: string;
  labelKey: string;
  countKey: "activeJobs" | "draftJobs" | "pausedJobs";
  icon: React.ElementType;
  accent: string;
}

/**
 * Quick status-filter shortcuts that deep-link into the Jobs page
 * (`/employer/jobs?status=active|draft|paused`). The Jobs page reads the
 * `status` query param on mount and pre-applies the filter.
 */
export function JobStatusQuickFilters({
  activeJobs,
  draftJobs,
  pausedJobs,
  locale,
}: JobStatusQuickFiltersProps) {
  const t = useTranslations("employerDashboard.jobQuickFilters");

  const jobsHref = `/${locale}/employer/jobs`;

  const tabs: Tab[] = [
    {
      status: "active",
      href: `${jobsHref}?status=active`,
      labelKey: "activeTab",
      countKey: "activeJobs",
      icon: Briefcase,
      accent:
        "border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    },
    {
      status: "draft",
      href: `${jobsHref}?status=draft`,
      labelKey: "draftTab",
      countKey: "draftJobs",
      icon: FileEdit,
      accent:
        "border-amber-200 bg-amber-50/70 text-amber-700 hover:border-amber-300 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    },
    {
      status: "paused",
      href: `${jobsHref}?status=paused`,
      labelKey: "pausedTab",
      countKey: "pausedJobs",
      icon: PauseCircle,
      accent:
        "border-sky-200 bg-sky-50/70 text-sky-700 hover:border-sky-300 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    },
  ];

  const counts: Record<Tab["countKey"], number> = {
    activeJobs,
    draftJobs,
    pausedJobs,
  };

  return (
    <section aria-label={t("sectionLabel")} className="workspace-panel-surface rounded-2xl p-3.5 sm:rounded-[28px] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h2 className="mt-1.5 text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {t("heading")}
          </h2>
        </div>
        <Link
          href={jobsHref}
          className="text-xs font-semibold text-sky-700 transition-colors hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
        >
          {t("manageAll")}
        </Link>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.countKey];
          return (
            <Link
              key={tab.status}
              href={tab.href}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                tab.accent
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 text-sm font-semibold">{t(tab.labelKey)}</span>
              <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-bold tabular-nums">
                {count}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
