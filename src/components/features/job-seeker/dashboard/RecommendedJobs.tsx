"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  MapPin,
  DollarSign,
  Loader2,
  Bookmark,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RecommendedJob {
  _id: string;
  title: string;
  salary: { min: number; max: number; currency: string };
  location: { country: string; city: string; isRemote: boolean };
  employerId: { _id: string; companyName: string; logo?: string } | null;
  matchScore: number;
  createdAt: string;
}

export function RecommendedJobs({ locale }: { locale: string }) {
  const [jobs, setJobs] = useState<RecommendedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/job-seeker/recommended-jobs")
      .then((r) => r.json())
      .then((data) => setJobs(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (jobId: string) => {
    setSavingId(jobId);
    try {
      await fetch("/api/saved-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
    } catch {}
    setSavingId(null);
  };

  if (loading) {
    return (
      <div className="card-base flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="card-base p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          No recommendations yet
        </p>
        <p className="text-xs text-muted-foreground">
          Set your job preferences to get personalized recommendations
        </p>
        <Link href={`/${locale}/job-seeker/preferences`}>
          <Button variant="outline" size="sm" className="mt-3">
            Set Preferences
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="card-base p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Recommended for You</h3>
        </div>
        <Link
          href={`/${locale}/job-seeker/jobs`}
          className="text-xs font-medium text-primary hover:underline"
        >
          View All Jobs
        </Link>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job._id}
            className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-accent/30"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/${locale}/job-seeker/jobs`}
                  className="text-sm font-semibold text-foreground hover:text-primary truncate"
                >
                  {job.title}
                </Link>
                <Badge
                  variant="secondary"
                  className={`shrink-0 text-[10px] px-1.5 py-0 ${
                    job.matchScore >= 70
                      ? "bg-green-100 text-green-700"
                      : job.matchScore >= 40
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {job.matchScore}% match
                </Badge>
              </div>

              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {job.employerId?.companyName ?? "Company"}
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.location.city}, {job.location.country}
                  {job.location.isRemote && " (Remote)"}
                </span>
                {job.salary?.min > 0 && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {job.salary.min.toLocaleString()}-
                    {job.salary.max.toLocaleString()} {job.salary.currency}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => handleSave(job._id)}
                disabled={savingId === job._id}
              >
                {savingId === job._id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>
              <Link href={`/${locale}/job-seeker/jobs`}>
                <Button size="sm" className="h-8 text-xs">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Apply
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
