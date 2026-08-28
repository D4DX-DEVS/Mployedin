"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users, Eye, Pencil, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ActiveJob {
  _id: string;
  title: string;
  status: string;
  applicantCount: number;
  avgMatchScore: number;
  location?: { city?: string; country?: string; isRemote?: boolean };
}

interface ActiveJobsListProps {
  jobs: ActiveJob[];
  locale: string;
}

export function ActiveJobsList({ jobs, locale }: ActiveJobsListProps) {
  const t = useTranslations("employerDashboard.activeJobsList");

  if (jobs.length === 0) return null;

  return (
    <div className="card-base overflow-hidden panel-body">
      <div className="px-5 pt-5 pb-2 sm:px-6 sm:pt-6 flex items-center justify-between">
        <h2 className="heading-label font-semibold text-muted-foreground uppercase tracking-wide">
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
              ? "text-emerald-600"
              : job.avgMatchScore >= 50
                ? "text-amber-600"
                : "text-muted-foreground";

          return (
            <Link
              key={job._id}
              href={`/${locale}/employer/applications?job=${job._id}`}
              className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all group hover:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {job.title}
                  </span>
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 shrink-0">
                    {job.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {job.location?.city && (
                    <span>{job.location.city}{job.location.isRemote ? ` ${t("remote")}` : ""}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {job.applicantCount} {job.applicantCount !== 1 ? t("applicants") : t("applicant")}
                  </span>
                  {job.avgMatchScore > 0 && (
                    <span className={cn("font-medium", matchColor)}>
                      {Math.round(job.avgMatchScore)}% {t("avgMatch")}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
