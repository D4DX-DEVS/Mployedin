"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MapPin, Briefcase } from "lucide-react";

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
  const { data, isLoading } = useQuery<{ jobs: SimilarJob[] }>({
    queryKey: ["similar-jobs", jobId],
    queryFn: () => fetch(`/api/jobs/${jobId}/similar`).then((r) => r.json()),
    staleTime: 10 * 60_000,
  });

  const jobs = data?.jobs ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Similar Jobs</h2>
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Similar Jobs</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        {jobs.map((job) => (
          <Link
            key={job._id}
            href={`/${locale}/job-seeker/jobs/${job._id}`}
            className="block bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all group"
          >
            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
              {job.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {job.employerId?.companyName ?? "Company"}
            </p>

            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.location?.isRemote
                  ? "Remote"
                  : job.location?.country ?? "—"}
              </span>
              {job.salary?.min && job.salary?.max && (
                <span>
                  {job.salary.currency ?? "AED"}{" "}
                  {job.salary.min.toLocaleString()}–{job.salary.max.toLocaleString()}
                </span>
              )}
            </div>

            {job.requirements?.skills && job.requirements.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {job.requirements.skills.slice(0, 4).map((s) => (
                  <span
                    key={s}
                    className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full"
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

            <div className="mt-2">
              <span className="text-[10px] bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                {job.overlap} matching skill{job.overlap !== 1 ? "s" : ""}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
