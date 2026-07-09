"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Search, Sparkles, MapPin, Clock, Briefcase, Loader2 } from "lucide-react";
import { formatLocalizedLocation } from "@/lib/i18n/locations";

interface Job {
  _id: string;
  title: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
  category: string;
  employmentType: string;
  salary?: { min: number; max: number; currency: string };
  description?: string;
  createdAt: string;
  matchScore?: number;
}

const PROMPTS = [
  "frontend",
  "fullstack",
  "marketing",
  "finance",
] as const;

export default function JobSeekerNLSearchPage() {
  const t = useTranslations("jobSeekerExtra.search");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const search = async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError("");
    setSearched(false);
    try {
      const res = await fetch(`/api/jobs/search?q=${encodeURIComponent(searchQuery)}&nl=true`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setSearched(true);
    } catch {
      // Fallback to basic search
      try {
        const res2 = await fetch(`/api/jobs?search=${encodeURIComponent(searchQuery)}&limit=20`);
        if (res2.ok) {
          const data = await res2.json();
          setJobs(data.jobs ?? []);
          setSearched(true);
        }
      } catch { setError(t("failed")); }
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score?: number) => {
    if (!score) return "";
    if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-muted-foreground bg-muted";
  };

  return (
    <div className="page-container">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="card-base space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={t("placeholder")}
              className="input-field w-full h-11 ps-9 pe-4 rounded-xl"
            />
          </div>
          <Button
            onClick={() => search()}
            disabled={!query.trim() || loading}
            size="lg"
            className="h-11 rounded-xl"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              onClick={() => { const text = t(`prompts.${prompt}`); setQuery(text); search(text); }}
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
            >
              {t(`prompts.${prompt}`)}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {searched && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">
            {t("resultsFound", { count: jobs.length.toLocaleString(numberLocale) })}
          </p>
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <EmptyState
                icon={Search}
                title={t("noResults")}
              />
            ) : (
              jobs.map((job) => (
                <div key={job._id} className="card-base hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold">{job.title}</h3>
                        {job.matchScore !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${scoreColor(job.matchScore)}`}>
                            {t("match", { score: job.matchScore.toLocaleString(numberLocale) })}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{formatLocalizedLocation(job.location, locale, { remoteLabel: t("remote"), fallback: "" })}</span>
                        <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{job.category}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />
                          {new Date(job.createdAt).toLocaleDateString(numberLocale)}
                        </span>
                        {job.salary && (
                          <span className="font-medium text-foreground">
                            {job.salary.currency} {job.salary.min?.toLocaleString(numberLocale)}–{job.salary.max?.toLocaleString(numberLocale)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={job.employmentType.replace("_", " ")} />
                      <a
                        href={`./jobs/${job._id}`}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        {t("apply")}
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
