"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { MapPin, Briefcase } from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

interface SimilarJob {
  _id: string;
  title: string;
  location?: { city?: string; country?: string; isRemote?: boolean };
  salary?: { min?: number; max?: number; currency?: string };
  requirements?: { skills?: string[] };
  employerId?: { companyName?: string };
  overlap: number;
}

export function SimilarJobs({ jobId, locale }: { jobId: string; locale: string }) {
  const t = useTranslations("similarJobs");

  const { data, isLoading } = useQuery<{ jobs: SimilarJob[] }>({
    queryKey: ["similar-jobs", jobId],
    queryFn: () => fetch(`/api/jobs/${jobId}/similar`).then((r) => r.json()),
    staleTime: 10 * 60_000,
  });

  const jobs = (data?.jobs ?? []).slice(0, 3);

  if (isLoading) {
    return (
      <div className="mt-8 border-t border-border pt-8 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("similarJobs")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg sm:rounded-3xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <div className="mt-8 border-t border-border pt-8 space-y-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("keepExploring")}</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t("similarJobs")}</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <Link
            key={job._id}
            href={`/${locale}/job-seeker/jobs/${job._id}`}
            className="group block rounded-lg sm:rounded-3xl border border-border/70 bg-card p-3 sm:p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_20px_45px_-34px_rgba(37,99,235,0.18)]"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {job.overlap} matching skill{job.overlap !== 1 ? "s" : ""}
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
              {job.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {job.employerId?.companyName ?? "Company"}
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                {job.location?.isRemote
                  ? "Remote"
                  : job.location?.country ?? "—"}
              </span>
              {job.salary?.min && job.salary?.max && (
                <span className="inline-flex rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                  {job.salary.currency ?? "AED"}{" "}
                  {formatCount(job.salary.min)}–{formatCount(job.salary.max)}
                </span>
              )}
            </div>

            {job.requirements?.skills && job.requirements.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.requirements.skills.slice(0, 4).map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                  >
                    {s}
                  </span>
                ))}
                {job.requirements.skills.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{job.requirements.skills.length - 4}
                  </span>
                )}
              </div>
            )}

            <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              {t("viewRole")}
              <Briefcase className="h-3.5 w-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
