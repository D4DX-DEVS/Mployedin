"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays, Check, FileText, Gift, Star, Undo2, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { seekerStageOf, type SeekerStage } from "@/lib/jobSeeker/seekerStatus";
import { shortDate, type AppliedJobSnippet } from "./homeData";

// The seeker's steps, not the employer's stages (lib/jobSeeker/seekerStatus).
const STAGE_LOOK: Record<SeekerStage, { icon: LucideIcon; tone: string }> = {
  applied: { icon: FileText, tone: "bg-primary/10 text-primary" },
  in_review: { icon: Star, tone: "bg-sky-100 text-sky-700" },
  interview: { icon: CalendarDays, tone: "bg-amber-100 text-amber-700" },
  offer: { icon: Gift, tone: "bg-emerald-100 text-emerald-700" },
  hired: { icon: Check, tone: "bg-emerald-100 text-emerald-700" },
  not_selected: { icon: X, tone: "bg-red-100 text-red-700" },
  withdrawn: { icon: Undo2, tone: "bg-muted text-muted-foreground" },
};

/**
 * What changed on the seeker's applications, newest change first. It replaces
 * the "Recently applied" list, which ordered by the date sent and so never
 * showed that an older application had moved.
 */
export function ApplicationUpdates({
  locale,
  items,
  total,
}: {
  locale: string;
  items: AppliedJobSnippet[];
  total?: number;
}) {
  const t = useTranslations("jobSeekerHome");
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const shown = [...items]
    .sort((a, b) => (b.changedAt ?? b.appliedAt ?? "").localeCompare(a.changedAt ?? a.appliedAt ?? ""))
    .slice(0, 4);

  return (
    <section
      aria-labelledby="job-seeker-application-updates"
      className="min-w-0 rounded-2xl border border-border/80 bg-card shadow-xs"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="job-seeker-application-updates" className="heading-section font-semibold tracking-tight">
            {t("updates.title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("updates.description")}</p>
        </div>
        {shown.length > 0 && (
          <Link
            href={`/${locale}/job-seeker/applications`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {typeof total === "number" && total > 0
              ? t("updates.viewAllCount", { count: total.toLocaleString(numberLocale) })
              : t("recentApplications.viewAll")}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="px-4 pb-5 pt-3 text-sm text-muted-foreground sm:px-5">
          <p>{t("recentApplications.empty")}</p>
          <Link
            href={`/${locale}/job-seeker/jobs`}
            className="mt-1 inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
          >
            {t("recommendedJobs.browseJobsCta")}
          </Link>
        </div>
      ) : (
        <ol className="mt-2 pb-1">
          {shown.map((item, index) => {
            const stage = seekerStageOf(item.status) ?? "applied";
            const look = STAGE_LOOK[stage];
            const when = shortDate(item.changedAt ?? item.appliedAt, locale);
            const detail = [item.companyName, item.place].filter(Boolean).join(" · ");
            return (
              <li key={`${item._id}-${index}`} className={cn(index > 0 && "border-t border-border/60")}>
                <Link
                  href={`/${locale}/job-seeker/applications`}
                  className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2.5 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
                >
                  <span className={cn("grid size-7 place-items-center rounded-full", look.tone)}>
                    <look.icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {t(`updates.status.${stage}`, { title: item.title })}
                    </span>
                    {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
                  </span>
                  {when && <time className="whitespace-nowrap text-xs text-muted-foreground">{when}</time>}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
