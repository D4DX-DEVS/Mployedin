"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Users,
  ChevronRight,
  Target,
  Clock,
  Eye,
  MessageSquare,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface EnhancedJob {
  _id: string;
  title: string;
  status: string;
  applicantCount: number;
  avgMatchScore: number;
  topMatchScore: number;
  views: number;
  location?: { city?: string; country?: string; isRemote?: boolean };
  createdAt: string;
}

interface EnhancedJobsListProps {
  jobs: EnhancedJob[];
  locale: string;
}

export function EnhancedJobsList({ jobs, locale }: EnhancedJobsListProps) {
  const t = useTranslations("employerDashboard.enhancedJobsList");

  if (jobs.length === 0) return null;

  return (
    <div className="card-base overflow-hidden panel-body">
      <div className="px-5 pt-5 pb-2 sm:px-6 sm:pt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t("activeJobs")}
        </h2>
        <Link
          href={`/${locale}/employer/jobs`}
          className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
        >
          {t("viewAll")} <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="px-3 pb-4 sm:px-4 space-y-1">
        {jobs.map((job) => {
          const matchColor =
            job.avgMatchScore >= 70
              ? "text-emerald-600 dark:text-emerald-400"
              : job.avgMatchScore >= 50
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground";

          const matchBg =
            job.avgMatchScore >= 70
              ? "bg-emerald-50 dark:bg-emerald-950/30"
              : job.avgMatchScore >= 50
                ? "bg-amber-50 dark:bg-amber-950/30"
                : "bg-muted/40";

          const daysAgo = getDaysAgo(job.createdAt);

          return (
            <div
              key={job._id}
              className="rounded-xl transition-all hover:bg-muted/50 p-3 group"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Link
                  href={`/${locale}/employer/applications?job=${job._id}`}
                  className="text-sm font-semibold text-foreground truncate hover:text-primary transition-colors flex-1 min-w-0"
                >
                  {job.title}
                </Link>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                  {job.status}
                </Badge>
                {daysAgo !== null && (
                  <span className="text-[10px] text-muted-foreground/60 shrink-0 hidden sm:inline-flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {daysAgo === 0 ? t("today") : t("daysAgo", { count: daysAgo })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {job.location?.city && (
                  <span>{job.location.city}{job.location.isRemote ? ` ${t("remote")}` : ""}</span>
                )}

                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {job.applicantCount} {job.applicantCount !== 1 ? t("applicants") : t("applicant")}
                </span>

                {job.views > 0 && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {job.views} {job.views !== 1 ? t("views") : t("view")}
                  </span>
                )}

                {job.avgMatchScore > 0 && (
                  <span className={cn("inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-md text-[11px]", matchColor, matchBg)}>
                    <Target className="h-2.5 w-2.5" />
                    {Math.round(job.avgMatchScore)}% {t("avgMatch")}
                  </span>
                )}

                {job.topMatchScore >= 70 && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                    \u2605 {t("topMatch", { score: Math.round(job.topMatchScore) })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Link
                  href={`/${locale}/employer/applications?job=${job._id}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <Users className="h-3 w-3" />
                  {t("viewCandidates")}
                </Link>
                <Link
                  href={`/${locale}/employer/interviews`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
                >
                  <Calendar className="h-3 w-3" />
                  {t("schedule")}
                </Link>
                <Link
                  href={`/${locale}/employer/messages`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  <MessageSquare className="h-3 w-3" />
                  {t("message")}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDaysAgo(dateStr: string): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
