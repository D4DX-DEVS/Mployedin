"use client";

/**
 * ActivityOverview — 4-card activity snapshot for the job seeker subscription page.
 * Applications come from the caller (already loaded with the subscription); profile
 * views, resume downloads, and AI resume score are fetched here since they live on
 * separate endpoints. Each card shows a contextual hint + a next-action link so the
 * dashboard nudges the user instead of just showing bare numbers.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { FileText, Eye, Download, Sparkles, type LucideIcon } from "lucide-react";

interface ProfileViewStats {
  totalViews: number;
  last30Days: number;
}

interface JobSeekerProfileLite {
  cv?: { atsScore?: number; downloadCount?: number };
}

async function fetchProfileViews(): Promise<ProfileViewStats | null> {
  const res = await fetch("/api/job-seeker/profile-views");
  if (!res.ok) return null;
  return res.json();
}

async function fetchProfile(): Promise<JobSeekerProfileLite | null> {
  const res = await fetch("/api/job-seekers/profile");
  if (!res.ok) return null;
  const data = await res.json();
  return data.profile ?? null;
}

function scoreLabel(score: number | undefined, t: ReturnType<typeof useTranslations>) {
  if (score === undefined) return t("scoreEmpty");
  if (score >= 80) return t("scoreGood");
  if (score >= 50) return t("scoreFair");
  return t("scoreNeedsWork");
}

interface StatCard {
  key: string;
  icon: LucideIcon;
  tone: string;
  bg: string;
  label: string;
  value: string;
  /** 0–100 usage bar (Applications only); null/undefined => show hint + link instead. */
  progress?: number | null;
  hint?: string;
  linkLabel?: string;
  linkHref?: string;
}

interface ActivityOverviewProps {
  appsUsed: number;
  appsMax: number;
}

export function ActivityOverview({ appsUsed, appsMax }: ActivityOverviewProps) {
  const t = useTranslations("jobSeekerExtra.subscription");
  const locale = useLocale();

  const { data: views } = useQuery({
    queryKey: ["job-seeker-profile-views-summary"],
    queryFn: fetchProfileViews,
    staleTime: 2 * 60 * 1000,
  });
  const { data: profile } = useQuery({
    queryKey: ["job-seeker-profile-lite"],
    queryFn: fetchProfile,
    staleTime: 2 * 60 * 1000,
  });

  const atsScore = profile?.cv?.atsScore;
  const downloadCount = profile?.cv?.downloadCount ?? 0;
  const viewsCount = views?.last30Days ?? 0;
  const unlimited = appsMax === -1;
  const pct = appsMax > 0 ? Math.min(100, Math.round((appsUsed / appsMax) * 100)) : 0;

  const cards: StatCard[] = [
    {
      key: "applications",
      icon: FileText,
      tone: "text-sky-500",
      bg: "bg-sky-500/10",
      label: t("applicationsUsed"),
      value: unlimited ? String(appsUsed) : `${appsUsed} / ${appsMax}`,
      progress: unlimited ? null : pct,
      hint: unlimited ? t("thisMonth") : undefined,
    },
    {
      key: "views",
      icon: Eye,
      tone: "text-violet-500",
      bg: "bg-violet-500/10",
      label: t("profileViewsStat"),
      value: String(viewsCount),
      hint: viewsCount > 0 ? t("thisMonth") : t("profileViewsHint"),
      linkLabel: t("updateProfile"),
      linkHref: `/${locale}/job-seeker/profile`,
    },
    {
      key: "downloads",
      icon: Download,
      tone: "text-teal-500",
      bg: "bg-teal-500/10",
      label: t("resumeDownloads"),
      value: String(downloadCount),
      hint: downloadCount > 0 ? t("thisMonth") : t("resumeDownloadsHint"),
      linkLabel: t("uploadResume"),
      linkHref: `/${locale}/job-seeker/documents`,
    },
    {
      key: "score",
      icon: Sparkles,
      tone: "text-amber-500",
      bg: "bg-amber-500/10",
      label: t("aiResumeScore"),
      value: atsScore !== undefined ? `${atsScore} / 100` : "—",
      hint: scoreLabel(atsScore, t),
      linkLabel: t("improveNow"),
      linkHref: `/${locale}/job-seeker/cv`,
    },
  ];

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {t("activityOverview")}
      </h4>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => {
          const hasBar = card.progress !== undefined && card.progress !== null;
          return (
            <div key={card.key} className="rounded-2xl border border-border/60 bg-card flex flex-col card-pad">
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${card.bg}`}>
                  <card.icon className={`h-4 w-4 ${card.tone}`} />
                </div>
                <p className="text-xs font-medium text-muted-foreground leading-tight">{card.label}</p>
              </div>
              <p className="text-2xl font-bold" dir="ltr">{card.value}</p>
              {hasBar ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">{t("thisMonth")}</span>
                    <span className="text-[11px] font-medium text-muted-foreground">{card.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        (card.progress ?? 0) >= 100 ? "bg-red-500" : (card.progress ?? 0) >= 80 ? "bg-amber-500" : "bg-sky-500"
                      }`}
                      style={{ width: `${Math.max(card.progress ?? 0, 2)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {card.hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{card.hint}</p>}
                  {card.linkLabel && card.linkHref && (
                    <Link
                      href={card.linkHref}
                      className={`text-[11px] font-medium mt-1.5 inline-block hover:underline ${card.tone}`}
                    >
                      {card.linkLabel} →
                    </Link>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
